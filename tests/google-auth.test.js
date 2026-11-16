import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { page, root, tick } from './helpers.js';
import { mockChrome } from './chrome-mock.js';
import { authPolicy, originsFor, rulesFor } from '../extension/shared.js';

const GOOGLE = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fcinema.test%2Fcallback&response_type=code&scope=openid';
const FIREBASE = 'https://movie-test.firebaseapp.com/__/auth/handler?authType=signInViaPopup&providerId=google.com&apiKey=public-test';
test('strict policy supports Google OAuth, GIS, wrapped account chooser and known local/Firebase starters', () => {
  for (const url of [GOOGLE, GOOGLE.replace('/v2/auth', '/auth'), 'https://accounts.google.com/gsi/select?client_id=123.apps.googleusercontent.com', `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(GOOGLE)}`, '/api/auth/signin/google', '/api/auth/google', '/auth/google', FIREBASE]) {
    assert(authPolicy.isStart(url, 'https://cinema.test/movie'), url);
  }
});
test('lookalikes, credentials, other Google services, insecure URLs and unrelated local routes are excluded', () => {
  for (const url of [GOOGLE.replace('accounts.google.com', 'accounts.google.com.evil.test'), GOOGLE.replace('accounts.google.com', 'evil.accounts.google.com'), GOOGLE.replace('https:', 'http:'), GOOGLE.replace('accounts.google.com', 'evil@accounts.google.com'), 'https://www.google.com/search?q=movie', 'https://accounts.google.com/o/oauth2/v2/auth', 'https://cinema.test/ads/google', 'https://other.test/api/auth/signin/google', 'https://movie-test.firebaseapp.com/advertisement?providerId=google.com', FIREBASE.replace('providerId=google.com', 'providerId=facebook.com')]) {
    assert.equal(authPolicy.isStart(url, 'https://cinema.test/'), false, url);
  }
  assert.equal(authPolicy.googleWidget('https://accounts.google.com/gsi/button?client_id=123.apps.googleusercontent.com'), true);
  assert.equal(authPolicy.googleWidget('https://accounts.google.com.evil.test/gsi/button?client_id=123'), false);
});
test('DNR exceptions apply only to accounts.google.com and the Firebase Google-auth handler', () => {
  const site = { host: 'cinema.test', enabled: true, navigation: true };
  const rules = rulesFor([site]), block = rules.find(r => r.action.type === 'block'), allow = rules.find(r => r.action.type === 'allow');
  assert.deepEqual(block.condition.excludedRequestDomains, ['cinema.test', 'accounts.google.com']);
  const re = new RegExp(allow.condition.regexFilter);
  assert(re.test(FIREBASE)); assert(!re.test('https://movie-test.firebaseapp.com/ads?providerId=google.com'));
  assert(!re.test(FIREBASE.replace('firebaseapp.com', 'firebaseapp.com.evil.test')));
  assert(!re.test(FIREBASE.replace('providerId=google.com', 'providerId=facebook.com')));
  assert.deepEqual(allow.condition.initiatorDomains, ['cinema.test']); assert.deepEqual(allow.condition.resourceTypes, ['main_frame']);
});
function nativePage(t, url = 'https://cinema.test/') {
  const p = page(url); t.after(() => p.dom.window.close());
  const calls = [], proxy = { opener: { marker: 'original-opener' }, close() {} };
  p.w.open = (...args) => { calls.push(args); return proxy; };
  Object.defineProperty(p.w.navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  const clicks = [], originalAdd = p.w.EventTarget.prototype.addEventListener;
  p.w.EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this === p.w && type === 'click') clicks.push(listener);
    return Reflect.apply(originalAdd, this, [type, listener, options]);
  };
  p.load('core', 'navigation');
  return { ...p, calls, proxy, loginClick() {
    const button = p.w.document.createElement('button'); button.textContent = 'Đăng nhập bằng Google'; p.w.document.body.append(button);
    clicks[0]({ isTrusted: true, button: 0, composedPath: () => [button] });
  } };
}
test('native Google popups preserve the returned WindowProxy, opener, name and features', t => {
  const p = nativePage(t);
  assert.equal(p.w.open(GOOGLE, 'google-login', 'popup,width=500,height=600'), p.proxy);
  assert.deepEqual(p.calls[0], [GOOGLE, 'google-login', 'popup,width=500,height=600']);
  assert.equal(p.proxy.opener.marker, 'original-opener');
  assert.equal(p.w.open('https://ads.test/', '_blank'), null); assert.equal(p.calls.length, 1);
});
test('Google popup requests without user activation remain blocked', t => {
  const p = nativePage(t); p.w.navigator.userActivation.isActive = false;
  assert.equal(p.w.open(GOOGLE), null); assert.equal(p.calls.length, 0);
});
test('one blank bootstrap follows a real Google login control, without allowing arbitrary blank popups', t => {
  const p = nativePage(t); p.w.navigator.userActivation.isActive = false;
  assert.equal(p.w.open('about:blank'), null); p.loginClick();
  assert.equal(p.w.open('', '__firebase_auth_popup', 'width=500,height=600'), p.proxy);
  assert.equal(p.proxy.__betterFilmsGoogleAuthSource, 'https://cinema.test');
  assert.equal(p.w.open('about:blank'), null); assert.equal(p.calls.length, 1);
});
test('same-tab Google authorization is allowed after activation while unrelated external redirects stay blocked', t => {
  const p = nativePage(t);
  const navigate = url => { const e = new p.w.Event('navigate', { cancelable: true }); e.destination = { url }; e.navigationType = 'push'; p.w.navigation.dispatchEvent(e); return e.defaultPrevented; };
  assert.equal(navigate(GOOGLE), false); assert.equal(navigate('https://ads.test/'), true);
});
test('an inherited blank auth context can reach Google but cannot escape to an advertisement', t => {
  const p = nativePage(t, 'about:blank'); p.w.navigator.userActivation.isActive = false; p.w.__betterFilmsGoogleAuthSource = 'https://cinema.test';
  const navigate = url => { const e = new p.w.Event('navigate', { cancelable: true }); e.destination = { url }; e.navigationType = 'push'; p.w.navigation.dispatchEvent(e); return e.defaultPrevented; };
  assert.equal(navigate(GOOGLE), false); assert.equal(navigate('https://ads.test/'), true);
});

async function worker(m, fastTimeout = false) {
  const context = vm.createContext({ chrome: m.chrome, URL, console, setTimeout: (fn, ms, ...args) => setTimeout(fn, fastTimeout && ms === 10000 ? 10 : ms, ...args), clearTimeout });
  const modules = new Map();
  async function load(file) {
    if (modules.has(file)) return modules.get(file);
    const module = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file });
    modules.set(file, module); await module.link((s, parent) => load(path.resolve(path.dirname(parent.identifier), s))); return module;
  }
  await (await load(path.join(root, 'extension/background.js'))).evaluate();
}
async function background(t, fastTimeout = false) {
  const m = mockChrome([{ host: 'mflix.store', enabled: true, navigation: true, video: true }]);
  await worker(m, fastTimeout);
  const sender = { url: 'https://mflix.store/', tab: { id: 7 }, frameId: 0 };
  const target = m.chrome.webNavigation.onCreatedNavigationTarget.listeners[0];
  const updated = m.chrome.tabs.onUpdated.listeners[0];
  t.after(() => { for (let id = 10; id < 30; id++) m.chrome.tabs.onRemoved.emit(id); });
  return { ...m, sender, target, updated };
}
test('fallback keeps a Google login tab and local starter while still closing ad and lookalike tabs', async t => {
  const m = await background(t);
  await m.target({ sourceTabId: 7, tabId: 10, url: GOOGLE });
  await m.target({ sourceTabId: 7, tabId: 11, url: 'https://mflix.store/api/auth/signin/google' });
  await m.target({ sourceTabId: 7, tabId: 12, url: 'https://ads.test/' });
  await m.target({ sourceTabId: 7, tabId: 13, url: GOOGLE.replace('accounts.google.com', 'accounts.google.com.evil.test') });
  assert(!m.calls.some(c => c[0] === 'close-tab' && [10, 11].includes(c[1])));
  assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 12)); assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 13));
});
test('a trusted Google intent grants one blank window; verified auth navigation releases the guard', async t => {
  const m = await background(t); m.tabs.push({ id: 10, url: 'about:blank' }, { id: 11, url: 'about:blank' });
  assert((await m.request({ type: 'GOOGLE_AUTH_INTENT', trustedClick: true }, m.sender)).ok);
  await m.target({ sourceTabId: 7, tabId: 10, url: 'about:blank' });
  await m.target({ sourceTabId: 7, tabId: 11, url: 'about:blank' });
  assert(!m.calls.some(c => c[0] === 'close-tab' && c[1] === 10)); assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 11));
  await m.updated(10, { url: GOOGLE });
  await m.updated(10, { url: 'https://mflix.store/auth/callback' });
  assert(!m.calls.some(c => c[0] === 'close-tab' && c[1] === 10));
});
test('a blank login bootstrap that navigates to an ad is closed', async t => {
  const m = await background(t); m.tabs.push({ id: 10, url: 'about:blank' });
  await m.request({ type: 'GOOGLE_AUTH_INTENT', trustedClick: true }, m.sender);
  await m.target({ sourceTabId: 7, tabId: 10, url: 'about:blank' }); await m.updated(10, { url: 'https://ads.test/' });
  assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 10));
});
test('blank bootstrap expiry closes a window that never reaches login', async t => {
  const m = await background(t, true); m.tabs.push({ id: 10, url: 'about:blank' });
  await m.request({ type: 'GOOGLE_AUTH_INTENT', trustedClick: true }, m.sender);
  await m.target({ sourceTabId: 7, tabId: 10, url: 'about:blank' }); await tick(35);
  assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 10));
});
test('a genuine embedded Google sign-in button can bootstrap its popup without parent DOM clicks', async t => {
  const m = await background(t); m.tabs.push({ id: 10, url: 'about:blank' });
  m.chrome.webNavigation.getFrame = async () => ({ url: 'https://accounts.google.com/gsi/button?client_id=123.apps.googleusercontent.com' });
  await m.target({ sourceTabId: 7, sourceFrameId: 3, tabId: 10, url: 'about:blank' });
  await m.updated(10, { url: 'https://accounts.google.com/v3/signin/identifier' });
  assert(!m.calls.some(c => c[0] === 'close-tab' && c[1] === 10));
});
test('Google intent messages from an unprotected page or without a trusted-click marker are rejected', async t => {
  const m = await background(t);
  assert.equal((await m.request({ type: 'GOOGLE_AUTH_INTENT', trustedClick: false }, m.sender)).ok, false);
  assert.equal((await m.request({ type: 'GOOGLE_AUTH_INTENT', trustedClick: true }, { ...m.sender, url: 'https://outside.test/' })).ok, false);
});
test('a popup whose Google authorization is pending is preserved during a slow load', async t => {
  const m = await background(t); m.tabs.push({ id: 10, url: 'about:blank', pendingUrl: GOOGLE });
  await m.target({ sourceTabId: 7, tabId: 10, url: 'about:blank' });
  assert(!m.calls.some(c => c[0] === 'close-tab' && c[1] === 10));
});
test('an inaccessible source frame does not exempt an unknown blank/ad popup', async t => {
  const m = await background(t); m.tabs.push({ id: 10, url: 'https://ads.test/' });
  m.chrome.webNavigation.getFrame = async () => { throw new Error('Frame removed'); };
  await m.target({ sourceTabId: 7, sourceFrameId: 3, tabId: 10, url: 'about:blank' });
  assert(m.calls.some(c => c[0] === 'close-tab' && c[1] === 10));
});
