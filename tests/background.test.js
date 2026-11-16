import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read, root, tick } from './helpers.js';
import { mockChrome } from './chrome-mock.js';
import { originsFor } from '../extension/shared.js';
import fs from 'node:fs';
import path from 'node:path';
async function worker(mock) {
  const context = vm.createContext({ chrome: mock.chrome, URL, console, setTimeout, clearTimeout });
  const modules = new Map();
  const load = async file => {
    if (modules.has(file)) return modules.get(file);
    const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
    modules.set(file, mod); await mod.link((s, p) => load(path.resolve(path.dirname(p.identifier), s))); return mod;
  };
  await (await load(path.join(root, 'extension/background.js'))).evaluate();
}
test('fresh startup leaves the protection list, rules and injections empty', async () => {
  const m = mockChrome(); await worker(m); m.chrome.runtime.onInstalled.emit(); await tick();
  assert.equal(m.db.sites.length, 0); assert.equal(m.scripts.length, 0); assert.equal(m.rules.length, 0); assert.equal(m.granted.size, 0);
});
test('add respects browser host access and reloads only the matching current tab', async () => {
  const m = mockChrome(); await worker(m);
  let result = await m.request({ type: 'ADD_SITE', host: 'mflix.store', tabId: 7 }); assert.equal(result.ok, false); assert.equal(m.db.sites.length, 0);
  await m.chrome.permissions.request({ origins: originsFor('mflix.store') });
  result = await m.request({ type: 'ADD_SITE', host: 'https://mflix.store/', tabId: 7 }); assert.equal(result.ok, true);
  assert.equal(m.db.sites[0].host, 'mflix.store'); assert.equal(m.scripts.length, 2); assert.equal(m.rules.length, 2); assert(m.calls.some(c => c[0] === 'reload' && c[1] === 7));
  assert(m.scripts.every(s => s.matches.every(pattern => pattern.includes('mflix.store'))));
});
test('pause removes injections/rules, resume restores, video toggle changes file list', async () => {
  const m = mockChrome(); await worker(m); await m.chrome.permissions.request({ origins: originsFor('mflix.store') }); await m.request({ type: 'ADD_SITE', host: 'mflix.store' });
  assert((await m.request({ type: 'UPDATE_SITE', host: 'mflix.store', patch: { enabled: false } })).ok);
  assert.equal(m.scripts.length, 0); assert.equal(m.rules.length, 0);
  await m.request({ type: 'UPDATE_SITE', host: 'mflix.store', patch: { enabled: true, video: false } });
  assert.equal(m.scripts.length, 2); assert(!m.scripts[0].js.includes('content/video.js')); assert.equal(m.rules.length, 2);
});
test('remove clears site, rules and registrations while preserving the install-time host grant', async () => {
  const m = mockChrome(); await worker(m); await m.chrome.permissions.request({ origins: originsFor('mflix.store') }); await m.request({ type: 'ADD_SITE', host: 'mflix.store' });
  assert((await m.request({ type: 'REMOVE_SITE', host: 'mflix.store' })).ok); await tick();
  assert.equal(m.db.sites.length, 0); assert.equal(m.scripts.length, 0); assert.equal(m.rules.length, 0); assert.equal(m.granted.size, 2);
  assert(!m.calls.some(c => c[0] === 'remove-permission'));
});
test('untrusted website messages cannot edit the site list or issue arbitrary privileged actions', async () => {
  const m = mockChrome(); await worker(m);
  const sender = { url: 'https://mflix.store/', tab: { id: 7 }, frameId: 0 };
  assert.equal((await m.request({ type: 'ADD_SITE', host: 'mflix.store' }, sender)).ok, false);
  assert.equal((await m.request({ type: 'GET_STATE' }, sender)).ok, false);
  assert.equal((await m.request({ type: 'OPEN_LINK', trustedClick: true, url: 'https://example.org' }, sender)).ok, false);
});
test('direct user link relay uses extension navigation and validates scheme and source scope', async () => {
  const m = mockChrome(); await worker(m); await m.chrome.permissions.request({ origins: originsFor('mflix.store') }); await m.request({ type: 'ADD_SITE', host: 'mflix.store' });
  const sender = { url: 'https://mflix.store/', tab: { id: 7 }, frameId: 0 };
  assert((await m.request({ type: 'OPEN_LINK', trustedClick: true, url: 'https://example.org', newTab: false }, sender)).ok);
  assert(m.calls.some(c => c[0] === 'update-tab' && c[2].url === 'https://example.org/'));
  assert.equal((await m.request({ type: 'OPEN_LINK', trustedClick: true, url: 'javascript:alert(1)' }, sender)).ok, false);
  assert.equal((await m.request({ type: 'OPEN_LINK', trustedClick: false, url: 'https://example.org' }, sender)).ok, false);
});
test('restart restores scoped registrations without duplicating them; revoked permission disables runtime', async () => {
  const m = mockChrome(); await worker(m); await m.chrome.permissions.request({ origins: originsFor('mflix.store') }); await m.request({ type: 'ADD_SITE', host: 'mflix.store' });
  m.chrome.runtime.onStartup.emit(); await tick(); assert.equal(m.scripts.length, 2); assert.equal(m.rules.length, 2);
  m.granted.clear(); m.chrome.permissions.onRemoved.emit({}); await tick(); assert.equal(m.scripts.length, 0); assert.equal(m.rules.length, 0);
  const result = await m.request({ type: 'GET_STATE' }); assert.equal(result.sites[0].granted, false);
});
test('failed rule installation rolls back registrations and never records a successful add', async () => {
  const m = mockChrome(); await worker(m); await m.chrome.permissions.request({ origins: originsFor('mflix.store') });
  const original = m.chrome.declarativeNetRequest.updateDynamicRules;
  let fail = true; m.chrome.declarativeNetRequest.updateDynamicRules = async params => { if (fail) { fail = false; throw new Error('rule rejected'); } return original(params); };
  const result = await m.request({ type: 'ADD_SITE', host: 'mflix.store' }); assert.equal(result.ok, false); assert.equal(m.db.sites.length, 0); assert.equal(m.scripts.length, 0);
});
test('fallback closes unsolicited tabs from protected sites but permits a recorded context-menu link once', async () => {
  const m = mockChrome(); await worker(m); await m.chrome.permissions.request({ origins: originsFor('mflix.store') }); await m.request({ type: 'ADD_SITE', host: 'mflix.store' });
  const onTarget = m.chrome.webNavigation.onCreatedNavigationTarget.listeners[0];
  await onTarget({ sourceTabId: 7, tabId: 10, sourceFrameId: 4, url: 'https://ad.test/' });
  assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 10));
  const sender = { url: 'https://mflix.store/', tab: { id: 7 }, frameId: 0 };
  await m.request({ type: 'LINK_INTENT', trustedClick: true, url: 'https://community.test/' }, sender);
  await onTarget({ sourceTabId: 7, tabId: 11, sourceFrameId: 0, url: 'https://community.test/' });
  assert(!m.calls.some(c => c[0] === 'close-tab' && c[1] === 11));
  await onTarget({ sourceTabId: 7, tabId: 12, sourceFrameId: 0, url: 'https://community.test/' });
  assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 12));
  await m.request({ type: 'UPDATE_SITE', host: 'mflix.store', patch: { enabled: false } });
  await onTarget({ sourceTabId: 7, tabId: 13, url: 'https://other.test/' });
  assert(!m.calls.some(c => c[0] === 'close-tab' && c[1] === 13));
});
test('existing sites receive hold-speed by default and its switch persists independently of ad skipping', async () => {
  const m = mockChrome([{ host: 'mflix.store', enabled: true, navigation: true, video: false }]);
  await worker(m); await m.chrome.permissions.request({ origins: originsFor('mflix.store') });
  m.chrome.runtime.onStartup.emit(); await tick();
  assert(m.scripts[0].js.includes('content/hold-speed.js'));
  assert(!m.scripts[0].js.includes('content/video.js'));
  const result = await m.request({ type: 'GET_STATE' }); assert.equal(result.sites[0].holdSpeed, true);
  await m.request({ type: 'UPDATE_SITE', host: 'mflix.store', patch: { holdSpeed: false } });
  assert.equal(m.db.sites[0].holdSpeed, false);
  assert(!m.scripts[0].js.includes('content/hold-speed.js'));
});
