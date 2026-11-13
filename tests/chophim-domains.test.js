import test from 'node:test';
import assert from 'node:assert/strict';
import { page, click, tick } from './helpers.js';
import { findSite } from '../extension/shared.js';

test('new Chophim domain and its subdomains use the verified adapter; lookalikes do not', t => {
  for (const [host, expected] of [['chophim.cfd', true], ['www.chophim.cfd', true], ['chophim.lol', true], ['chophim.cfd.evil.test', false], ['fakechophim.cfd', false]]) {
    const p = page(`https://${host}/`); t.after(() => p.dom.window.close()); p.load('core');
    assert.equal(p.w.__stillShieldV1.chophimHost, expected, host);
  }
});
test('new-domain watch links get tvc=1 with episode, channel and hash preserved', t => {
  const p = page('https://chophim.cfd/'); t.after(() => p.dom.window.close()); p.load('core', 'navigation', 'video');
  const a = p.w.document.createElement('a'); a.href = '/xem/demo?tap=3&channel=2#sv=1'; a.textContent = 'Xem'; p.w.document.body.append(a);
  let router = 0; a.addEventListener('click', () => router++);
  click(p.w, a);
  const url = new URL(a.href);
  assert.equal(url.searchParams.get('tvc'), '1'); assert.equal(url.searchParams.get('tap'), '3'); assert.equal(url.searchParams.get('channel'), '2'); assert.equal(url.hash, '#sv=1'); assert.equal(router, 0);
});
test('new-domain TVC is completed without affecting the movie', async t => {
  const p = page('https://chophim.cfd/xem/demo?tvc=1'); t.after(() => p.dom.window.close()); p.load('core', 'navigation', 'video');
  p.w.document.body.innerHTML = '<div role="link" aria-label="Tiếp tục xem trong tab mới"><video id="ad"></video><button aria-label="Tắt tiếng TVC"></button></div><video id="film"></video>';
  let ad = 0, film = 0;
  p.w.document.getElementById('ad').addEventListener('ended', () => ad++);
  p.w.document.getElementById('film').addEventListener('ended', () => film++);
  await tick(); assert(ad > 0); assert.equal(film, 0);
});
test('a future migrated domain can recognize the exact TVC fingerprint after delayed hydration', async t => {
  const p = page('https://cinema-new.test/xem/demo?tvc=1'); t.after(() => p.dom.window.close()); p.load('core', 'video');
  let now = 10000; p.w.Date.now = () => now;
  p.w.document.body.innerHTML = '<div id="ad-root" role="link" aria-label="Tiếp tục xem trong tab mới"><video></video><button aria-label="Bật tiếng TVC"></button></div><video id="film"></video>';
  await tick();
  let completed = 0;
  const root = p.w.document.getElementById('ad-root');
  root.querySelector('video').addEventListener('ended', () => { completed++; root.remove(); });
  for (let i = 0; i < 20; i++) { root.className = `loading-${i}`; await tick(1); }
  assert.equal(completed, 0, 'Early mutations are rate-limited while hydration is pending');
  now += 800; root.className = 'hydrated'; await tick(); assert.equal(completed, 1);
  assert(p.w.document.getElementById('film').isConnected);
});
test('an unverified hostname without the TVC sound-control fingerprint keeps its video untouched', async t => {
  const p = page('https://ordinary.test/'); t.after(() => p.dom.window.close()); p.load('core', 'video');
  p.w.document.body.innerHTML = '<div role="link" aria-label="Tiếp tục xem trong tab mới"><video></video></div>';
  let ended = 0; p.w.document.querySelector('video').addEventListener('ended', () => ended++);
  await tick(); assert.equal(ended, 0);
});
test('a domain migration never silently expands the user-selected website list', () => {
  assert.equal(findSite([{ host: 'chophim.lol', enabled: true }], 'https://chophim.cfd/'), null);
  assert.equal(findSite([{ host: 'chophim.cfd', enabled: true }], 'https://chophim.cfd/').host, 'chophim.cfd');
});
