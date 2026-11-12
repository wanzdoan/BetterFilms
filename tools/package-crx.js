// Chrome's native CRX3 packer. Signing keys stay local and are never published.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const runtime = path.join(root, 'extension');
const { version } = JSON.parse(fs.readFileSync(path.join(runtime, 'manifest.json'), 'utf8'));
const dist = path.join(root, 'dist');
const keyPath = path.resolve(process.env.BETTERFILMS_SIGNING_KEY || path.join(root, '.local-keys', 'BetterFilms.pem'));
const chrome = process.env.CHROME_PATH || [
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find(file => fs.existsSync(file));
if (!chrome || !fs.existsSync(chrome)) throw new Error('Chrome not found. Set CHROME_PATH to its executable.');
fs.mkdirSync(dist, { recursive: true });
if (!fs.existsSync(keyPath)) {
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });
  fs.writeFileSync(keyPath, privateKey, { mode: 0o600, flag: 'wx' });
  console.log('Created a local signing key. Keep it for future CRX updates.');
}
const result = spawnSync(chrome, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${path.join(dist, '.pack-profile')}`,
  `--pack-extension=${runtime}`, `--pack-extension-key=${keyPath}`,
], { windowsHide: true, timeout: 60000, encoding: 'utf8' });
if (result.error) throw result.error;
const packed = runtime + '.crx';
if (result.status !== 0 || !fs.existsSync(packed)) {
  throw new Error(`Chrome pack failed (${result.status}): ${result.stderr || result.stdout}`);
}
const target = path.join(dist, `BetterFilms-${version}.crx`);
fs.copyFileSync(packed, target);
fs.unlinkSync(packed);
const bytes = fs.readFileSync(target);
if (bytes.toString('ascii', 0, 4) !== 'Cr24' || bytes.readUInt32LE(4) !== 3) throw new Error('Expected a CRX3 package.');
// Keep checksums for both formats, preserving a single downloadable checksum file.
const lines = ['zip', 'crx'].flatMap(ext => {
  const file = path.join(dist, `BetterFilms-${version}.${ext}`);
  return fs.existsSync(file) ? [`${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${path.basename(file)}`] : [];
});
fs.writeFileSync(path.join(dist, 'SHA256.txt'), lines.join('\n') + '\n');
console.log(target);
console.log(`CRX3, ${bytes.length.toLocaleString('en-US')} bytes`);
