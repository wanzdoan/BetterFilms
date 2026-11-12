import test from 'node:test';
import assert from 'node:assert/strict';
import { page, tick } from './helpers.js';
import { mockChrome } from './chrome-mock.js';
const site = { host: 'cinema.test', enabled: true, navigation: true, video: true };
async function setup(t, entries = [site]) {
  const p = page(); t.after(() => p.dom.window.close()); const m = mockChrome(entries), handlers = {};
  p.w.chrome = m.chrome; m.chrome.runtime.sendMessage = async value => { m.calls.push(['message', value]); return { ok: true }; };
  const add = p.w.addEventListener.bind(p.w); p.w.addEventListener = (name, fn, options) => { handlers[name] = fn; add(name, fn, options); };
  p.load('bridge'); await tick();
  const a = p.w.document.createElement('a'); a.href = 'https://community.test/help'; a.textContent = 'Cộng đồng'; p.w.document.body.append(a);
  const invoke = (extra = {}) => {
    let prevented = false, stopped = false;
    handlers[extra.type || 'click']({ type: 'click', isTrusted: true, button: 0, composedPath: () => [a], preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; }, ...extra });
    return { prevented, stopped };
  };
  return { ...p, m, a, invoke };
}
test('isolated bridge relays a deliberate external click; synthetic page clicks have no privilege', async t => {
  const p = await setup(t);
  assert.equal(p.invoke({ isTrusted: false }).prevented, false); assert.equal(p.m.calls.length, 0);
  assert(p.invoke().prevented); assert.equal(p.m.calls[0][1].type, 'OPEN_LINK'); assert.equal(p.m.calls[0][1].url, 'https://community.test/help');
});
test('native same-site self links pass; ctrl/middle-click uses new tab relay', async t => {
  const p = await setup(t); p.a.href = '/watch/2';
  assert.equal(p.invoke().prevented, false); assert.equal(p.m.calls.length, 0);
  assert(p.invoke({ ctrlKey: true }).prevented); assert(p.m.calls.at(-1)[1].newTab); assert(p.m.calls.at(-1)[1].background);
  assert(p.invoke({ type: 'auxclick', button: 1 }).prevented); assert(p.m.calls.at(-1)[1].newTab);
});
test('context-menu intent preserves browser menu and grants one explicit link destination', async t => {
  const p = await setup(t); assert.equal(p.invoke({ type: 'contextmenu', button: 2 }).prevented, false);
  assert.equal(p.m.calls[0][1].type, 'LINK_INTENT');
});
test('empty/giant overlay links and paused sites never get a navigation relay', async t => {
  const p = await setup(t); p.a.textContent = ''; assert.equal(p.invoke().prevented, false); assert.equal(p.m.calls.length, 0);
  p.a.textContent = 'ad'; p.a.style.cssText = 'position:fixed;width:100%;height:100%;'; assert.equal(p.invoke().prevented, false); assert.equal(p.m.calls.length, 0);
  p.m.db.sites[0].enabled = false; p.m.chrome.storage.onChanged.emit({ sites: {} }, 'local'); await tick(); p.a.style.cssText = ''; assert.equal(p.invoke().prevented, false); assert.equal(p.m.calls.length, 0);
});
