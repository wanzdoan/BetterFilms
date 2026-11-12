import test from 'node:test';
import assert from 'node:assert/strict';
import { page, read, runModule, tick } from './helpers.js';
import { mockChrome } from './chrome-mock.js';
const site = { host: 'mflix.store', enabled: true, navigation: true, video: true, granted: true };
function ui(file, sites = [], url = 'https://mflix.store/') {
  const p = page(`chrome-extension://still-test/ui/${file}.html`, read(`extension/ui/${file}.html`));
  const m = mockChrome(sites); m.tabs[0].url = url;
  m.chrome.runtime.sendMessage = async message => {
    m.calls.push(['message', message]);
    if (message.type === 'GET_STATE') return { ok: true, sites: structuredClone(m.db.sites) };
    if (message.type === 'ADD_SITE') { m.db.sites.push({ ...site, host: message.host }); return { ok: true, sites: structuredClone(m.db.sites) }; }
    if (message.type === 'UPDATE_SITE') { Object.assign(m.db.sites.find(s => s.host === message.host), message.patch); return { ok: true, sites: structuredClone(m.db.sites) }; }
    if (message.type === 'REMOVE_SITE') { m.db.sites = m.db.sites.filter(s => s.host !== message.host); return { ok: true, sites: structuredClone(m.db.sites) }; }
  };
  p.w.chrome = m.chrome; return { ...p, m, $: id => p.w.document.getElementById(id) };
}
test('popup begins unprotected and adds current domain directly without a permission prompt', async t => {
  const p = ui('popup'); t.after(() => p.dom.window.close()); await runModule(p.dom, 'extension/ui/popup.js');
  assert.equal(p.$('current-host').textContent, 'mflix.store'); assert.equal(p.$('site-count').textContent, '0'); assert.equal(p.$('protections').hidden, true);
  p.$('add-current').click(); await tick();
  assert(!p.m.calls.some(c => c[0] === 'request')); assert.equal(p.$('status-text').textContent, 'Đang bảo vệ'); assert.equal(p.$('protections').hidden, false);
  assert(p.m.calls.find(c => c[0] === 'message' && c[1].type === 'ADD_SITE')[1].host === 'mflix.store');
});
test('failed add keeps list empty and shows the background error without requesting permission', async t => {
  const p = ui('popup'); t.after(() => p.dom.window.close());
  const original = p.m.chrome.runtime.sendMessage;
  p.m.chrome.runtime.sendMessage = async message => message.type === 'ADD_SITE' ? { ok: false, error: 'Bật quyền truy cập website trong cài đặt trình duyệt.' } : original(message);
  await runModule(p.dom, 'extension/ui/popup.js'); p.$('add-current').click(); await tick();
  assert.equal(p.m.db.sites.length, 0); assert(p.$('message').classList.contains('error')); assert.match(p.$('message').textContent, /Bật quyền/);
  assert(!p.m.calls.some(c => c[0] === 'request'));
});
test('popup toggles pause/video and reload control remains explicit', async t => {
  const p = ui('popup', [site]); t.after(() => p.dom.window.close()); await runModule(p.dom, 'extension/ui/popup.js');
  p.$('video').checked = false; p.$('video').dispatchEvent(new p.w.Event('change')); await tick(); assert.equal(p.m.db.sites[0].video, false);
  p.$('pause-current').click(); await tick(); assert.equal(p.m.db.sites[0].enabled, false); assert.equal(p.$('video').disabled, true);
  p.$('reload-current').click(); assert(p.m.calls.some(c => c[0] === 'reload'));
});
test('manual URL entry normalizes host and unsupported browser pages do not offer current-site add', async t => {
  const p = ui('popup', [], 'chrome://extensions/'); t.after(() => p.dom.window.close()); await runModule(p.dom, 'extension/ui/popup.js');
  assert.equal(p.$('add-current').disabled, true);
  p.$('domain').value = 'https://example.com/watch/123'; p.$('manual-form').dispatchEvent(new p.w.Event('submit', { cancelable: true })); await tick();
  assert.equal(p.m.db.sites[0].host, 'example.com'); assert.equal(p.$('site-count').textContent, '1');
});
test('options empty state, add, search, settings, delete and help route all work', async t => {
  const p = ui('options'); t.after(() => p.dom.window.close()); await runModule(p.dom, 'extension/ui/options.js');
  assert.equal(p.$('empty').hidden, false);
  p.$('domain').value = 'mflix.store'; p.$('manual-form').dispatchEvent(new p.w.Event('submit', { cancelable: true })); await tick();
  assert.equal(p.$('empty').hidden, true); assert.equal(p.$('sites').children.length, 1);
  p.$('search').value = 'not-found'; p.$('search').dispatchEvent(new p.w.Event('input')); assert.equal(p.$('no-results').hidden, false);
  p.$('search').value = ''; p.$('search').dispatchEvent(new p.w.Event('input'));
  const details = p.$('sites').querySelector('details'); details.open = true;
  const checkbox = details.querySelector('input'); checkbox.checked = false; checkbox.dispatchEvent(new p.w.Event('change')); await tick(); assert.equal(p.m.db.sites[0].navigation, false); assert(p.$('sites').querySelector('details').open);
  p.$('sites').querySelector('.remove').click(); await tick(); assert.equal(p.$('empty').hidden, false);
  p.w.location.hash = '#guide'; await tick(); assert.equal(p.$('guide-view').hidden, false); assert.equal(p.$('websites-view').hidden, true);
});
test('stored hostname renders as text, never HTML', async t => {
  const p = ui('options', [{ ...site, host: '<img src=x onerror=alert(1)>' }]); t.after(() => p.dom.window.close()); await runModule(p.dom, 'extension/ui/options.js');
  assert.equal(p.$('sites').querySelectorAll('img').length, 0); assert.match(p.$('sites').textContent, /<img/);
});
