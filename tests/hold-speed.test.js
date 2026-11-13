import test from 'node:test';
import assert from 'node:assert/strict';
import { page, tick } from './helpers.js';

function setup(t, { fullscreen = true, pointer = true, rate = 1.25, paused = false, videoFullscreen = false } = {}) {
  const p = page(); t.after(() => p.dom.window.close());
  const w = p.w;
  w.document.body.innerHTML = '<div id="player"><video id="film" src="movie.mp4"></video><div id="surface"></div><button id="button">Pause</button><input id="seek" type="range"></div>';
  const root = w.document.getElementById('player'), video = w.document.getElementById('film'), surface = w.document.getElementById('surface');
  let full = fullscreen ? (videoFullscreen ? video : root) : null;
  let isPaused = paused;
  Object.defineProperty(w.document, 'fullscreenElement', { configurable: true, get: () => full });
  Object.defineProperty(video, 'paused', { configurable: true, get: () => isPaused });
  video.playbackRate = rate; video.defaultPlaybackRate = 1.5;
  video.getBoundingClientRect = () => ({ left: 0, top: 0, right: 640, bottom: 360, width: 640, height: 360 });
  if (pointer) w.PointerEvent = w.MouseEvent;
  const timeout = w.setTimeout.bind(w), delays = [];
  w.setTimeout = (fn, ms, ...args) => { delays.push(ms); return timeout(fn, ms === 350 ? 5 : ms, ...args); };
  p.load('core', 'hold-speed');
  const emit = (type, target = surface, extra = {}) => {
    const event = new w.Event(type, { bubbles: true, cancelable: true, composed: true });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 200, clientY: 140, ...extra });
    target.dispatchEvent(event); return event;
  };
  return { ...p, root, video, surface, emit, delays, setPaused: value => { isPaused = value; },
    setFullscreen: value => { full = value; w.document.dispatchEvent(new w.Event('fullscreenchange')); } };
}

test('hold in fullscreen sets 2x and shows badge; release restores exact previous rate without changing default', async t => {
  const p = setup(t); p.emit('pointerdown'); await tick();
  assert(p.delays.includes(350)); assert.equal(p.video.playbackRate, 2);
  assert.equal(p.root.querySelector('[data-betterfilms-speed]').textContent, '2×');
  assert.equal(p.emit('pointerup').defaultPrevented, true);
  assert.equal(p.video.playbackRate, 1.25); assert.equal(p.video.defaultPlaybackRate, 1.5);
  assert.equal(p.root.querySelector('[data-betterfilms-speed]'), null);
});
test('ordinary taps remain untouched and holding outside fullscreen has no effect', async t => {
  const p = setup(t); const down = p.emit('pointerdown'); const up = p.emit('pointerup'); await tick();
  assert.equal(down.defaultPrevented, false); assert.equal(up.defaultPrevented, false); assert.equal(p.video.playbackRate, 1.25);
  p.setFullscreen(null); p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 1.25);
  assert.equal(p.emit('contextmenu').defaultPrevented, false);
});
test('player controls and the native seekbar area are excluded', async t => {
  const p = setup(t);
  p.emit('pointerdown', p.w.document.getElementById('button')); await tick(); assert.equal(p.video.playbackRate, 1.25);
  p.emit('pointerdown', p.w.document.getElementById('seek')); await tick(); assert.equal(p.video.playbackRate, 1.25);
  p.video.controls = true; p.emit('pointerdown', p.video, { clientY: 350 }); await tick(); assert.equal(p.video.playbackRate, 1.25);
});
test('touch contextmenu is suppressed only during a valid fullscreen press; right-click remains available', async t => {
  const p = setup(t); assert.equal(p.emit('contextmenu').defaultPrevented, false);
  p.emit('pointerdown'); assert.equal(p.emit('contextmenu').defaultPrevented, true); await tick(); p.emit('pointerup');
  p.emit('pointerdown', p.surface, { pointerType: 'mouse' }); assert.equal(p.emit('contextmenu').defaultPrevented, false); p.emit('pointerup');
});
test('dragging before the threshold cancels activation; dragging during hold restores rate', async t => {
  const p = setup(t); p.emit('pointerdown'); p.emit('pointermove', p.surface, { clientX: 230 }); await tick(); assert.equal(p.video.playbackRate, 1.25);
  p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 2);
  p.emit('pointermove', p.surface, { clientY: 165 }); assert.equal(p.video.playbackRate, 1.25);
});
test('multitouch, pointercancel and lost capture restore rate', async t => {
  const p = setup(t);
  for (const type of ['pointercancel', 'lostpointercapture', 'multitouch']) {
    p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 2);
    if (type === 'multitouch') p.emit('pointerdown', p.surface, { pointerId: 2, isPrimary: false }); else p.emit(type);
    assert.equal(p.video.playbackRate, 1.25);
  }
});
test('a context menu arriving after pointercancel is still canceled, without leaving the rate stuck', async t => {
  const p = setup(t); p.emit('pointerdown'); await tick(); p.emit('pointercancel');
  assert.equal(p.video.playbackRate, 1.25); assert.equal(p.emit('contextmenu').defaultPrevented, true);
  p.setFullscreen(null); assert.equal(p.emit('contextmenu').defaultPrevented, false);
});
test('touchend cleans up a touch hold even if pointerup is lost', async t => {
  const p = setup(t); p.emit('pointerdown'); await tick();
  p.emit('touchend', p.surface, { touches: [], changedTouches: [{ identifier: 99 }] });
  assert.equal(p.video.playbackRate, 1.25);
});
test('fullscreen exit, blur, pagehide and pause restore the old rate', async t => {
  const p = setup(t);
  for (const type of ['fullscreen', 'blur', 'pagehide', 'pause']) {
    p.setFullscreen(p.root); p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 2);
    if (type === 'fullscreen') p.setFullscreen(null);
    else if (type === 'pause') p.video.dispatchEvent(new p.w.Event('pause'));
    else p.w.dispatchEvent(new p.w.Event(type));
    assert.equal(p.video.playbackRate, 1.25);
  }
});
test('disabling the feature or pausing site protection cancels a hold and restores fullscreen styles', async t => {
  const p = setup(t); p.emit('pointerdown'); await tick();
  assert.equal(p.root.style.getPropertyValue('user-select'), 'none');
  p.w.__stillShieldV1.update({ holdSpeed: false });
  assert.equal(p.video.playbackRate, 1.25); assert.equal(p.root.style.getPropertyValue('user-select'), '');
  p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 1.25);
  p.w.__stillShieldV1.update({ holdSpeed: true }); p.emit('pointerdown'); await tick();
  p.w.__stillShieldV1.update({ active: false }); assert.equal(p.video.playbackRate, 1.25);
});
test('a real click after holding is swallowed, but the next deliberate tap is preserved', async t => {
  const p = setup(t); p.emit('pointerdown'); await tick(); p.emit('pointerup');
  assert.equal(p.emit('click', p.surface, { detail: 1 }).defaultPrevented, true);
  p.emit('pointerdown'); p.emit('pointerup');
  assert.equal(p.emit('click', p.surface, { detail: 1 }).defaultPrevented, false);
});
test('the feature does not start paused movies or accelerate known ad components', async t => {
  const p = setup(t, { paused: true }); p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 1.25);
  p.setPaused(false); p.root.className = 'jw-flag-ads'; p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 1.25);
});
test('removal, source replacement and an independent rate change cannot leave 2x stuck', async t => {
  const p = setup(t); p.emit('pointerdown'); await tick();
  p.video.setAttribute('src', 'episode-2.mp4'); await tick(); assert.equal(p.video.playbackRate, 1.25);
  p.emit('pointerdown'); await tick(); p.video.playbackRate = 1.75; p.video.dispatchEvent(new p.w.Event('ratechange')); p.emit('pointerup'); assert.equal(p.video.playbackRate, 1.75);
  p.emit('pointerdown'); await tick(); p.video.remove(); await tick(); assert.equal(p.video.playbackRate, 1.75);
});
test('touch fallback supports hold/release and cancels browser touch menu', async t => {
  const p = setup(t, { pointer: false });
  const touch = { identifier: 4, clientX: 200, clientY: 140 };
  p.emit('touchstart', p.surface, { touches: [touch] }); await tick(); assert.equal(p.video.playbackRate, 2);
  assert.equal(p.emit('contextmenu').defaultPrevented, true);
  assert.equal(p.emit('touchend', p.surface, { touches: [], changedTouches: [touch] }).defaultPrevented, true);
  assert.equal(p.video.playbackRate, 1.25);
});
test('fullscreen video itself is supported when DOM input is delivered', async t => {
  const p = setup(t, { videoFullscreen: true }); p.emit('pointerdown', p.video); await tick(); assert.equal(p.video.playbackRate, 2);
  p.emit('pointerup', p.video); assert.equal(p.video.playbackRate, 1.25);
});
test('WebKit fullscreen flags are recognized without enabling hold on a normal page', async t => {
  const p = setup(t, { fullscreen: false });
  p.emit('pointerdown', p.video); await tick(); assert.equal(p.video.playbackRate, 1.25);
  Object.defineProperty(p.video, 'webkitDisplayingFullscreen', { configurable: true, value: true });
  p.emit('pointerdown', p.video); await tick(); assert.equal(p.video.playbackRate, 2);
  p.emit('pointerup', p.video); assert.equal(p.video.playbackRate, 1.25);
});
test('original fullscreen styles are restored, including an existing important user-select setting', t => {
  const p = setup(t, { fullscreen: false }); p.root.style.setProperty('user-select', 'text', 'important');
  p.setFullscreen(p.root); assert.equal(p.root.style.getPropertyValue('user-select'), 'none');
  p.setFullscreen(null); assert.equal(p.root.style.getPropertyValue('user-select'), 'text'); assert.equal(p.root.style.getPropertyPriority('user-select'), 'important');
});
test('a same-origin frame can recognize fullscreen requested on its outer iframe', async t => {
  const p = setup(t, { fullscreen: false });
  const outer = page(); t.after(() => outer.dom.window.close());
  const frame = outer.w.document.createElement('iframe'); outer.w.document.body.append(frame);
  Object.defineProperty(outer.w.document, 'fullscreenElement', { configurable: true, value: frame });
  Object.defineProperty(p.w, 'frameElement', { configurable: true, get: () => frame });
  p.emit('pointerdown'); await tick(); assert.equal(p.video.playbackRate, 2);
  p.emit('pointerup'); assert.equal(p.video.playbackRate, 1.25);
});
