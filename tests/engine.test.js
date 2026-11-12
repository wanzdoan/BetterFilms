import test from 'node:test';
import assert from 'node:assert/strict';
import { page, read, click, tick } from './helpers.js';
test('script popups, blank-then-redirect and setter replacement blocked; live pause works', t => {
  const p = page(); t.after(() => p.dom.window.close()); p.load('core', 'navigation');
  assert.equal(p.w.open('about:blank'), null); p.w.open = () => 'bypass';
  assert.equal(p.w.open('https://ad.test'), null); assert.equal(p.opens, 0);
  p.w.__stillShieldV1.update({ active: false }); p.w.open('https://normal.test'); assert.equal(p.opens, 1);
});
test('actual Chophim popunder handler is inert while a normal click still works', t => {
  const p = page('https://chophim.lol/'); t.after(() => p.dom.window.close()); p.load('core', 'navigation');
  const s = read('tests/fixtures/chophim-module.js'), start = s.indexOf('let r=e=>{if(0===e.button)'), end = s.indexOf(';return document.addEventListener("click",r', start);
  assert(start > 0 && end > start);
  p.w.localStorage.clear();
  const fn = p.w.eval(`(function(){const B='chophim:popunder-last-shown';return (${s.slice(start + 6, end)});})()`);
  p.w.document.addEventListener('click', fn, { capture: true });
  const button = p.w.document.createElement('button'); p.w.document.body.append(button);
  let normal = 0; button.addEventListener('click', () => normal++);
  assert.equal(click(p.w, button).defaultPrevented, false); assert.equal(normal, 1); assert.equal(p.opens, 0);
  assert.equal(p.w.localStorage.getItem('chophim:popunder-last-shown'), null);
});
test('actual Mflix popup configuration is neutralized without changing VIP/account fields', async t => {
  const p = page('https://mflix.store/'); t.after(() => p.dom.window.close()); p.load('core', 'navigation');
  p.w.POPUP_CONFIG = { cooldown: 120, ads: [{ link: 'https://ad.test/', cookie: 'ad', type: 'secondary' }], isVip: false, custom: 1 };
  assert.equal(p.w.POPUP_CONFIG.ads.length, 0); assert.equal(p.w.POPUP_CONFIG.isVip, false); assert.equal(p.w.POPUP_CONFIG.custom, 1);
  p.w.eval(read('tests/fixtures/mflix-popup.js')); await tick(); assert.equal(p.w.document.body.children.length, 0);
  p.w.__stillShieldV1.update({ active: false }); assert.equal(p.w.POPUP_CONFIG.ads.length, 1);
});
test('actual Mflix secondary overlay is blocked generically on an unknown domain', async t => {
  const p = page(); t.after(() => p.dom.window.close());
  const timeout = p.w.setTimeout.bind(p.w); p.w.setTimeout = (fn, ms, ...args) => timeout(fn, ms === 2000 ? 0 : ms, ...args);
  p.load('core', 'navigation');
  p.w.POPUP_CONFIG = { cooldown: 120, ads: [{ link: 'https://ad.test/', cookie: 'ad', type: 'secondary' }], isVip: false };
  p.w.eval(read('tests/fixtures/mflix-popup.js')); await tick();
  const overlay = p.w.document.body.querySelector('div'); assert(overlay);
  assert.equal(overlay.style.pointerEvents, 'none');
  assert.equal(click(p.w, overlay).defaultPrevented, true); assert.equal(p.opens, 0); assert.equal(p.w.document.cookie, '');
  p.w.__stillShieldV1.update({ active: false }); assert.equal(overlay.style.pointerEvents, '');
});
test('navigation API cancels foreign redirects but preserves same-site and browser history', t => {
  const p = page(); t.after(() => p.dom.window.close()); p.load('core', 'navigation');
  const nav = (url, type = 'push') => { const event = new p.w.Event('navigate', { cancelable: true }); event.destination = { url }; event.navigationType = type; p.w.navigation.dispatchEvent(event); return event.defaultPrevented; };
  assert(nav('https://ad.test/')); assert(!nav('https://cinema.test/watch/2')); assert(!nav('https://previous.test', 'traverse'));
  p.w.__stillShieldV1.update({ navigation: false }); assert(!nav('https://normal.test/'));
});
test('risky onclick property handlers are suppressed and can be removed normally', t => {
  const p = page(); t.after(() => p.dom.window.close()); p.load('core', 'navigation');
  p.w.eval(`window.ran=0;window.activeAd={};window.bad=function(){window.ran++; if(activeAd){window.open(location.href); window.location.replace('https://ad.test');}}`);
  const el = p.w.document.createElement('button'); p.w.document.body.append(el); el.onclick = p.w.bad; click(p.w, el); assert.equal(p.w.ran, 0); assert.equal(el.onclick, p.w.bad);
  el.onclick = null; el.addEventListener('click', p.w.bad); el.removeEventListener('click', p.w.bad); click(p.w, el); assert.equal(p.w.ran, 0);
});
test('transparent overlay removed from hit testing; opaque modal and player survive; no observer spin', async t => {
  const p = page(); t.after(() => p.dom.window.close()); p.load('core', 'navigation');
  p.w.document.body.innerHTML = '<div id="trap" style="position:fixed;width:100%;height:100%;z-index:99999999;background:transparent"></div><div id="modal" style="position:fixed;width:100%;height:100%;z-index:99999;background:black"><button>Đóng</button></div><div id="player" style="position:fixed;width:100%;height:100%;z-index:99999;background:transparent"><video></video></div>';
  let mutations = 0; new p.w.MutationObserver(rows => mutations += rows.length).observe(p.w.document.body, { attributes: true, subtree: true });
  await tick(); assert.equal(p.w.document.querySelector('#trap').style.pointerEvents, 'none');
  assert.equal(p.w.document.querySelector('#modal').style.pointerEvents, ''); assert.equal(p.w.document.querySelector('#player').style.pointerEvents, '');
  const count = mutations; await tick(); assert.equal(mutations, count, 'No infinite style-mutation loop');
});
test('TVC completion targets exact Chophim component; movie, intro and disabled skips survive', async t => {
  const p = page('https://chophim.lol/xem/demo?tvc=1'); t.after(() => p.dom.window.close()); p.load('core', 'navigation', 'video');
  p.w.document.body.innerHTML = '<div role="link" aria-label="Tiếp tục xem trong tab mới"><video id="ad"></video></div><video id="film"></video><button id="skip">Bỏ qua quảng cáo</button><button id="disabled" disabled>Skip ad</button><button id="intro">Bỏ qua giới thiệu</button>';
  let ended = 0, film = 0, skips = 0, disabled = 0, intro = 0;
  p.w.document.querySelector('#ad').addEventListener('ended', () => ended++);
  p.w.document.querySelector('#film').addEventListener('ended', () => film++);
  for (const [id, inc] of [['skip', () => skips++], ['disabled', () => disabled++], ['intro', () => intro++]]) p.w.document.getElementById(id).addEventListener('click', inc);
  await tick(); assert(ended > 0); assert.equal(film, 0); assert.equal(skips, 1); assert.equal(disabled, 0); assert.equal(intro, 0);
  assert.equal(click(p.w, p.w.document.querySelector('#ad')).defaultPrevented, true);
});
test('generic JW/IMA skip controls work on another site; hidden controls and movies stay untouched', async t => {
  const p = page(); t.after(() => p.dom.window.close()); p.load('core', 'video');
  p.w.document.body.innerHTML = '<div id="jw" role="button" class="jw-skip jw-skippable">Skip</div><button id="ima" class="videoAdUiSkipButton">Skip</button><button id="hidden" style="display:none">Skip ad</button><video></video>';
  let jw = 0, ima = 0, hidden = 0;
  p.w.document.getElementById('jw').addEventListener('click', () => jw++); p.w.document.getElementById('ima').addEventListener('click', () => ima++); p.w.document.getElementById('hidden').addEventListener('click', () => hidden++);
  await tick(); assert.equal(jw, 1); assert.equal(ima, 1); assert.equal(hidden, 0); assert.equal(p.w.document.querySelector('video').currentTime, 0);
});
test('watch links preserve episode, server and hash while suppressing stale Next Link callback', t => {
  const p = page('https://chophim.lol/'); t.after(() => p.dom.window.close()); p.load('core', 'video');
  const a = p.w.document.createElement('a'); a.href = '/xem/demo?tap=2&sv=3#channel=4'; a.textContent = 'Xem'; p.w.document.body.append(a);
  let router = 0; a.addEventListener('click', () => router++);
  click(p.w, a); const u = new URL(a.href); assert.equal(u.searchParams.get('tvc'), '1'); assert.equal(u.searchParams.get('tap'), '2'); assert.equal(u.searchParams.get('sv'), '3'); assert.equal(u.hash, '#channel=4'); assert.equal(router, 0);
});
