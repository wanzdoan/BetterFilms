(() => {
  'use strict';
  if (globalThis.__stillShieldV1) return;
  const native = {
    add: EventTarget.prototype.addEventListener, remove: EventTarget.prototype.removeEventListener,
    source: Function.prototype.toString, open: window.open, setTimeout: window.setTimeout.bind(window),
    createEvent: window.Event,
  };
  const state = { active: true, navigation: false, video: false, holdSpeed: false };
  const chophimHost = ['chophim.lol', 'chophim.cfd'].some(host => location.hostname === host || location.hostname.endsWith(`.${host}`));
  const onUpdate = new Set();
  const update = config => {
    for (const k of ['active', 'navigation', 'video', 'holdSpeed']) if (typeof config?.[k] === 'boolean') state[k] = config[k];
    for (const fn of onUpdate) fn();
  };
  const toURL = value => { try { return new URL(String(value), location.href); } catch { return null; } };
  const sameSite = url => {
    const u = toURL(url);
    const host = location.hostname;
    return !!u && (u.hostname === host || u.hostname.endsWith(`.${host}`));
  };
  const listen = (target, type, fn, options) => Reflect.apply(native.add, target, [type, fn, options]);
  const visible = el => {
    if (!el?.isConnected || !el.getClientRects().length) return false;
    const css = getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden' && (css.opacity === '' || Number(css.opacity) !== 0);
  };
  const trap = el => {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
    const huge = rect.width >= innerWidth * .8 && rect.height >= innerHeight * .8;
    const empty = !el.textContent.trim() && !el.querySelector('video,button,input,textarea,select');
    const transparent = Number(css.opacity) === 0 || ['transparent', 'rgba(0, 0, 0, 0)', ''].includes(css.backgroundColor);
    return huge && empty && transparent && ['fixed', 'absolute'].includes(css.position) && Number(css.zIndex) >= 10000;
  };
  const api = { native, state, update, onUpdate, toURL, sameSite, listen, visible, trap, chophimHost, auth: globalThis.__betterFilmsAuthPolicy };
  Object.defineProperty(globalThis, '__stillShieldV1', { value: api, configurable: true });
})();
