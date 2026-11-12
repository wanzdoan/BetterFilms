import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
const root = path.resolve(import.meta.dirname, '../extension');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(f => f.isDirectory() ? walk(path.join(dir, f.name)) : [path.join(dir, f.name)]);
const files = walk(root), manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3); assert(!manifest.content_scripts);
assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*']); assert(!manifest.optional_host_permissions);
assert(!manifest.permissions.includes('webRequestBlocking')); assert(!manifest.permissions.includes('debugger'));
const references = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, ...Object.values(manifest.icons)];
for (const ref of references) assert(fs.existsSync(path.join(root, ref)), ref);
for (const file of files) {
  if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(file, 'utf8');
    assert(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(text), `Remote/eval execution in ${file}`);
    assert(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon/.test(text), `Unexpected network transport in ${file}`);
  }
  if (file.endsWith('.html') || file.endsWith('.css')) {
    const text = fs.readFileSync(file, 'utf8');
    assert(!/(?:src|href)\s*=\s*["']https?:|url\(\s*["']?https?:/.test(text), `Remote UI dependency: ${file}`);
    for (const match of text.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) {
      if (match[1].startsWith('#')) continue;
      assert(fs.existsSync(path.resolve(path.dirname(file), match[1])), `Missing local resource ${match[1]}`);
    }
  }
}
for (const [size, file] of Object.entries(manifest.icons)) {
  const bytes = fs.readFileSync(path.join(root, file)); assert.equal(bytes.readUInt32BE(16), Number(size)); assert.equal(bytes.readUInt32BE(20), Number(size));
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.deepEqual([alpha(0, 0), alpha(info.width - 1, 0), alpha(0, info.height - 1), alpha(info.width - 1, info.height - 1)], [0, 0, 0, 0], `Corners must be transparent: ${file}`);
}
console.log(`PASS: MV3 manifest invariants; ${files.filter(f => f.endsWith('.js')).length} JavaScript files; local HTML/CSS references; bundled fonts and icons; no eval or network clients.`);
