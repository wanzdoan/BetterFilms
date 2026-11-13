(() => {
  'use strict';
  const api = globalThis.__stillShieldV1;
  if (!api || api.navigationInstalled) return;
  api.navigationInstalled = true;
  api.state.navigation = true;
  const { native, state, listen, toURL, sameSite, trap } = api;
  const enabled = () => state.active && state.navigation;
  const overlays = new Map();
  function neutralize(el) {
    if (overlays.has(el)) return;
    overlays.set(el, [el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')]);
    el.style.setProperty('pointer-events', 'none', 'important');
  }
  api.onUpdate.add(() => {
    if (!enabled()) {
      for (const [el, [value, priority]] of overlays) {
        if (value) el.style.setProperty('pointer-events', value, priority);
        else el.style.removeProperty('pointer-events');
      }
      overlays.clear();
    } else sweep();
  });
  const clickTypes = new Set(['click', 'auxclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']);
  function risky(listener) {
    let src;
    try {
      const fn = typeof listener === 'function' ? listener : listener?.handleEvent;
      if (typeof fn !== 'function') return false;
      src = Reflect.apply(native.source, fn, []);
    } catch { return false; }
    // Both observed families: clone-and-assign, and clone-or-fallback-to-href.
    return src.includes('tinyurl.com/2wrb84c7') || src.includes('chophim:popunder-last-shown') ||
      (src.includes('window.open') && /(?:location|top)\s*(?:\.\s*(?:assign|replace|href)|\[\s*["'](?:assign|replace|href)["']\s*\])/.test(src) &&
        /stopImmediatePropagation|activeAd|globalCookieName|chophimapp-tvc|popunder/i.test(src));
  }
  // Wrapped listeners stay registered so a live pause can let them run again.
  const mappings = new WeakMap();
  function mapped(target, listener, type) {
    let targets = mappings.get(listener);
    if (!targets) { targets = new WeakMap(); mappings.set(listener, targets); }
    let types = targets.get(target);
    if (!types) { types = new Map(); targets.set(target, types); }
    if (!types.has(type)) types.set(type, function (...args) {
      if (enabled()) {
        if (trap(this)) neutralize(this);
        return;
      }
      if (typeof listener === 'function') return Reflect.apply(listener, this, args);
      return Reflect.apply(listener.handleEvent, listener, args);
    });
    return types.get(type);
  }
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (clickTypes.has(type) && risky(listener)) {
      if (enabled() && trap(this)) neutralize(this);
      return Reflect.apply(native.add, this, [type, mapped(this, listener, type), options]);
    }
    return Reflect.apply(native.add, this, [type, listener, options]);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const wrapper = listener && mappings.get(listener)?.get(this)?.get(type);
    return Reflect.apply(native.remove, this, [type, wrapper || listener, options]);
  };
  // Include property handlers (onclick=...), not just addEventListener.
  for (const proto of [HTMLElement.prototype, Document.prototype, Window.prototype]) {
    for (const name of ['onclick', 'onmousedown', 'onpointerdown', 'ontouchstart']) {
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d?.set || !d.get || !d.configurable) continue;
      const assigned = new WeakMap();
      Object.defineProperty(proto, name, { ...d,
        get() { return assigned.has(this) ? assigned.get(this) : Reflect.apply(d.get, this, []); },
        set(fn) {
          assigned.set(this, fn);
          const actual = risky(fn) ? mapped(this, fn, name) : fn;
          return Reflect.apply(d.set, this, [actual]);
        },
      });
    }
  }
  const guardedOpen = function (...args) {
    if (enabled()) {
      const value = String(args[0] ?? '').trim();
      const destination = value ? toURL(value) : null;
      const target = String(args[1] || '_blank').toLowerCase();
      // Some episode lists remove href, then navigate with open(url, '_self').
      // This is same-tab navigation, not a popup. Keep outside destinations blocked.
      if (target !== '_self' || !destination || !['http:', 'https:'].includes(destination.protocol) || !sameSite(destination.href)) return null;
    }
    return Reflect.apply(native.open, this, args);
  };
  try { Object.defineProperty(window, 'open', { configurable: false, get: () => guardedOpen, set() {} }); }
  catch { window.open = guardedOpen; }

  function stop(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function guard(event) {
    if (!enabled()) return;
    const path = event.composedPath();
    const el = path.find(n => n instanceof Element);
    if (!el) return;
    const adVideo = el.closest('[role="link"][aria-label="Tiếp tục xem trong tab mới"]');
    if (adVideo && !el.closest('button')) { stop(event); return; }
    const overlay = path.find(n => n instanceof Element && trap(n));
    if (overlay) {
      neutralize(overlay);
      stop(event);
    }
  }
  for (const type of [...clickTypes, 'keydown']) listen(window, type, guard, { capture: true, passive: false });

  // Location methods are unforgeable. Cancel navigation via the browser's navigation event.
  // User-selected external anchors are handled separately in the isolated bridge.
  if (window.navigation) listen(window.navigation, 'navigate', event => {
    if (!enabled() || event.navigationType === 'traverse' || !event.cancelable) return;
    const u = toURL(event.destination?.url);
    if (u && ['http:', 'https:'].includes(u.protocol) && !sameSite(u.href)) event.preventDefault();
  });
  function sweep() {
    if (!enabled()) return;
    // Opaque backdrops and actual player containers are deliberately not selected.
    for (const el of document.querySelectorAll('[style*="z-index"], [style*="zIndex"]')) {
      if (trap(el)) neutralize(el);
    }
    for (const meta of document.querySelectorAll('meta[http-equiv]')) {
      if (meta.httpEquiv.toLowerCase() !== 'refresh') continue;
      const match = meta.content.match(/url\s*=\s*["']?([^"']+)/i);
      if (match && !sameSite(match[1].trim())) meta.remove();
    }
  }
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    native.setTimeout(() => { pending = false; sweep(); }, 0);
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'content', 'http-equiv'] });
  sweep();

  // Site adapter: replace the popup campaign list, not the account/VIP state.
  if (location.hostname === 'mflix.store' || location.hostname.endsWith('.mflix.store')) {
    let config = window.POPUP_CONFIG;
    try { Object.defineProperty(window, 'POPUP_CONFIG', { configurable: true,
      get: () => enabled() && config ? { ...config, ads: [] } : config,
      set: value => { config = value; },
    }); } catch { /* Generic overlay, window.open and navigation guards remain active. */ }
  }
  if (api.chophimHost) {
    try { localStorage.setItem('chophim:popunder-last-shown', String(Date.now())); } catch {}
  }
})();
