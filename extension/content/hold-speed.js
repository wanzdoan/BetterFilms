(() => {
  'use strict';
  const api = globalThis.__stillShieldV1;
  if (!api || api.holdSpeedInstalled) return;
  api.holdSpeedInstalled = true;
  api.state.holdSpeed = true;
  const { state, native, listen, visible } = api;
  const HOLD_MS = 350;
  const MOVE_TOLERANCE = 12;
  const controls = 'button,a,input,textarea,select,[contenteditable="true"],[role="button"],[role="slider"],[role="menu"],[role="menuitem"],.jw-controlbar,.jw-settings-menu,.vjs-control-bar,.plyr__controls,.dplayer-controller,.art-bottom';
  const adSurface = '[role="link"][aria-label="Tiếp tục xem trong tab mới"],.jw-flag-ads,.vjs-ad-playing,[data-ad-type="preroll"]';
  const nativeFullscreen = new WeakSet();
  let press = null;
  let touchMenuGuard = null;
  let suppressClick = null;
  let styledRoot = null;
  let savedStyles = [];

  const enabled = () => state.active && state.holdSpeed;
  const composedContains = (root, child) => {
    for (let node = child; node; node = node.parentNode || node.host) if (node === root) return true;
    return false;
  };
  function localFullscreen() {
    const local = document.fullscreenElement || document.webkitFullscreenElement;
    if (local) return local;
    try {
      const frame = window.frameElement;
      const parentRoot = frame?.ownerDocument.fullscreenElement || frame?.ownerDocument.webkitFullscreenElement;
      if (parentRoot && composedContains(parentRoot, frame)) return document.documentElement;
    } catch { /* Cross-origin parents do not expose their fullscreen state here. */ }
    return null;
  }
  function fullscreenRoot(video) {
    const root = localFullscreen();
    if (root && composedContains(root, video)) return root;
    if (video.webkitDisplayingFullscreen || nativeFullscreen.has(video)) return video;
    return null;
  }
  function videosWithin(root) {
    const videos = root instanceof HTMLVideoElement ? [root] : [...root.querySelectorAll('video')];
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) videos.push(...videosWithin(el.shadowRoot));
    return videos;
  }
  function restoreStyles() {
    if (!styledRoot) return;
    for (const [name, value, priority, applied] of savedStyles) {
      if (styledRoot.style.getPropertyValue(name) !== applied) continue;
      if (value) styledRoot.style.setProperty(name, value, priority);
      else styledRoot.style.removeProperty(name);
    }
    styledRoot = null;
    savedStyles = [];
  }
  function syncStyles() {
    const root = enabled() ? localFullscreen() : null;
    if (root === styledRoot) return;
    restoreStyles();
    if (!(root instanceof HTMLElement) || !videosWithin(root).length) return;
    styledRoot = root;
    for (const [name, value] of [['-webkit-touch-callout', 'none'], ['-webkit-user-select', 'none'], ['user-select', 'none']]) {
      savedStyles.push([name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name), value]);
      root.style.setProperty(name, value, 'important');
    }
  }
  function inside(rect, x, y) { return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; }
  function videoFor(event, x, y) {
    if (!enabled()) return null;
    const path = event.composedPath();
    const target = path.find(el => el instanceof Element);
    if (!target || target.closest(adSurface)) return null;
    const root = localFullscreen();
    const candidates = [...new Set([
      ...path.filter(el => el instanceof HTMLVideoElement),
      ...(root ? videosWithin(root) : []),
    ])];
    for (const video of candidates) {
      const full = fullscreenRoot(video);
      if (!full || !video.isConnected || video.paused || video.ended || !visible(video) || video.closest(adSurface)) continue;
      const rect = video.getBoundingClientRect();
      if (!inside(rect, x, y)) continue;
      // Retain player buttons, seekbars and native controls. Large role=button
      // surfaces wrapping the movie are allowed; actual small controls are not.
      if (path.some(el => el instanceof Element && el.matches(controls) && !composedContains(el, video))) continue;
      if (video.controls && y >= rect.bottom - Math.min(64, rect.height * .18)) continue;
      return { video, root: full };
    }
    return null;
  }
  function sourceOf(video) { return video.currentSrc || video.getAttribute('src') || ''; }
  function isValid(item) {
    return enabled() && item.video.isConnected && !item.video.paused && !item.video.ended &&
      fullscreenRoot(item.video) === item.root && sourceOf(item.video) === item.source;
  }
  function removeBadge(item) { item.badge?.remove(); }
  function finish({ restore = true, suppress = false } = {}) {
    const item = press;
    press = null;
    if (!item) return;
    clearTimeout(item.timer);
    if (item.active) {
      // Do not overwrite a rate changed independently by a player or the user.
      if (restore && item.video.playbackRate === 2) {
        try { item.video.playbackRate = item.previousRate; } catch {}
      }
      if (suppress) suppressClick = { root: item.root, until: Date.now() + 500 };
      removeBadge(item);
    }
  }
  function showBadge(item) {
    if (item.root instanceof HTMLVideoElement) return; // Native fullscreen overlays may be outside DOM rendering.
    const badge = document.createElement('span');
    badge.textContent = '2×';
    badge.setAttribute('data-betterfilms-speed', '');
    badge.setAttribute('aria-hidden', 'true');
    badge.style.cssText = 'position:absolute;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:7px 14px;border-radius:999px;background:rgba(0,0,0,.75);color:#fff;font:600 14px/20px system-ui,sans-serif;pointer-events:none;user-select:none';
    item.root.appendChild(badge);
    item.badge = badge;
  }
  function start(event, id, kind, x, y) {
    suppressClick = null; // A new deliberate tap must never be swallowed by an old hold.
    touchMenuGuard = null;
    if (press) { finish({ suppress: true }); return; }
    const match = videoFor(event, x, y);
    if (!match) return;
    const item = { ...match, id, kind, x, y, source: sourceOf(match.video), active: false };
    press = item;
    if (['touch', 'pen'].includes(kind)) touchMenuGuard = { ...item, until: Date.now() + 30000 };
    syncStyles();
    item.timer = native.setTimeout(() => {
      if (press !== item || !isValid(item)) { if (press === item) finish(); return; }
      item.previousRate = item.video.playbackRate;
      if (!Number.isFinite(item.previousRate) || item.previousRate <= 0) { finish(); return; }
      try { item.video.playbackRate = 2; } catch { finish(); return; }
      if (item.video.playbackRate !== 2) {
        try { item.video.playbackRate = item.previousRate; } catch {}
        finish(); return;
      }
      item.active = true;
      showBadge(item);
    }, HOLD_MS);
  }
  function move(event, id, x, y) {
    if (!press || press.id !== id) return;
    if (Math.hypot(x - press.x, y - press.y) > MOVE_TOLERANCE || !isValid(press)) {
      finish({ suppress: true });
      return;
    }
    if (press.active && event.cancelable) event.preventDefault();
  }
  function release(event, id) {
    if (!press || press.id !== id) return;
    const held = press.active;
    finish({ suppress: held });
    if (held) { if (event.cancelable) event.preventDefault(); event.stopImmediatePropagation(); }
  }
  const capture = { capture: true, passive: false };
  if ('PointerEvent' in window) {
    listen(window, 'pointerdown', event => {
      if (event.isPrimary === false || event.button !== 0) { finish({ suppress: true }); return; }
      start(event, event.pointerId, event.pointerType || 'mouse', event.clientX, event.clientY);
    }, capture);
    listen(window, 'pointermove', event => move(event, event.pointerId, event.clientX, event.clientY), capture);
    listen(window, 'pointerup', event => release(event, event.pointerId), capture);
    for (const type of ['pointercancel', 'lostpointercapture']) listen(window, type, event => {
      if (press?.id === event.pointerId) {
        // Some mobile browsers cancel the pointer immediately before contextmenu.
        if (touchMenuGuard) touchMenuGuard.until = Date.now() + 1000;
        finish({ suppress: true });
      }
    }, true);
  } else {
    listen(window, 'touchstart', event => {
      if (event.touches.length !== 1) { finish({ suppress: true }); return; }
      const touch = event.touches[0];
      start(event, touch.identifier, 'touch', touch.clientX, touch.clientY);
    }, capture);
    listen(window, 'touchmove', event => {
      if (event.touches.length !== 1) { finish({ suppress: true }); return; }
      const touch = event.touches[0];
      move(event, touch.identifier, touch.clientX, touch.clientY);
    }, capture);
    listen(window, 'touchend', event => {
      for (const touch of event.changedTouches) release(event, touch.identifier);
    }, capture);
    listen(window, 'touchcancel', () => finish({ suppress: true }), true);
  }
  // A browser may stop delivering pointerup after opening its long-press flow.
  // Touch endings provide an independent cleanup signal, never a second start.
  listen(window, 'touchend', event => {
    if (press?.kind === 'touch' && event.touches.length === 0) release(event, press.id);
    if (touchMenuGuard) touchMenuGuard.until = Date.now() + 500;
  }, capture);
  listen(window, 'touchcancel', () => {
    if (touchMenuGuard) touchMenuGuard.until = Date.now() + 1000;
    finish({ suppress: true });
  }, true);
  listen(window, 'contextmenu', event => {
    const item = press || touchMenuGuard;
    if (!item || !['touch', 'pen'].includes(item.kind) || (!press && item.until < Date.now()) || !isValid(item)) return;
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }, capture);
  listen(window, 'click', event => {
    if (!suppressClick) return;
    const target = event.composedPath().find(el => el instanceof Element);
    if (Date.now() > suppressClick.until) { suppressClick = null; return; }
    if (event.detail === 0 || !target || !composedContains(suppressClick.root, target)) return;
    suppressClick = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, capture);
  const fullscreenChanged = () => { if (press && !isValid(press)) finish(); syncStyles(); };
  for (const type of ['fullscreenchange', 'webkitfullscreenchange']) listen(document, type, fullscreenChanged, true);
  listen(document, 'webkitbeginfullscreen', event => {
    if (event.target instanceof HTMLVideoElement) nativeFullscreen.add(event.target);
  }, true);
  listen(document, 'webkitendfullscreen', event => {
    if (event.target instanceof HTMLVideoElement) nativeFullscreen.delete(event.target);
    fullscreenChanged();
  }, true);
  for (const type of ['pause', 'ended', 'emptied', 'loadstart', 'error']) listen(document, type, event => {
    if (press?.video === event.target) finish();
  }, true);
  listen(document, 'ratechange', event => {
    if (press?.active && press.video === event.target && press.video.playbackRate !== 2) finish({ restore: false });
  }, true);
  listen(document, 'visibilitychange', () => { if (document.hidden) finish(); }, true);
  listen(window, 'blur', () => finish(), true);
  listen(window, 'pagehide', () => finish(), true);
  new MutationObserver(() => { if (press && !isValid(press)) finish(); }).observe(document, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['src'],
  });
  api.onUpdate.add(() => { if (!enabled()) finish(); syncStyles(); });
  syncStyles();
})();
