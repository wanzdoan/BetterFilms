(() => {
  'use strict';
  const api = globalThis.__stillShieldV1;
  if (!api || api.videoInstalled) return;
  api.videoInstalled = true;
  api.state.video = true;
  const { state, listen, native, visible, toURL } = api;
  const chophim = location.hostname === 'chophim.lol' || location.hostname.endsWith('.chophim.lol');
  const tvcSelector = '[role="link"][aria-label="Tiếp tục xem trong tab mới"]';
  function watchURL(value) {
    const u = toURL(value);
    if (!chophim || !u || u.origin !== location.origin || !u.pathname.startsWith('/xem/')) return null;
    u.searchParams.set('tvc', '1');
    return u.href;
  }
  const rewriteWatchLink = event => {
    if (!state.active || !state.video) return;
    const el = event.composedPath().find(n => n instanceof Element);
    const a = el?.closest('a[href]');
    if (!a || a.hasAttribute('download')) return;
    const next = watchURL(a.href);
    if (next && next !== a.href) {
      a.href = next;
      // Preserve native default action; suppress the Next Link handler's stale href.
      if (!(a.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1)) event.stopImmediatePropagation();
    }
  };
  listen(window, 'click', rewriteWatchLink, true);
  listen(window, 'auxclick', rewriteWatchLink, true);
  const attempts = new WeakMap();
  const clicked = new WeakMap();
  function sweep() {
    if (!state.active || !state.video) return;
    if (chophim) for (const root of document.querySelectorAll(tvcSelector)) {
      const video = root.querySelector('video');
      if (!video || (attempts.get(video) || 0) >= 8) continue;
      attempts.set(video, (attempts.get(video) || 0) + 1);
      video.muted = true;
      video.pause();
      video.dispatchEvent(new native.createEvent('ended'));
    }
    const selectors = [
      '.jw-skip.jw-skippable', '.vjs-skip-ad', '.vast-skip-button',
      '.videoAdUiSkipButton', '.ima-ad-container button[aria-label*="Skip"]',
      'button[aria-label="Bỏ qua quảng cáo"]', 'button[aria-label="Skip ad"]',
    ];
    const candidates = new Set(document.querySelectorAll(selectors.join(',')));
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if (/^(bỏ qua quảng cáo|skip ads?|skip advertisement)$/i.test(el.textContent.trim())) candidates.add(el);
    }
    for (const el of candidates) {
      if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true' ||
          /(?:^|\s)(?:disabled|vast-skip-button-disabled)(?:\s|$)/.test(el.className) ||
          Date.now() - (clicked.get(el) || 0) < 3000) continue;
      clicked.set(el, Date.now());
      el.click();
    }
  }
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    native.setTimeout(() => { pending = false; sweep(); }, 0);
  };
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'] });
  listen(document, 'DOMContentLoaded', schedule, { once: true });
  setInterval(schedule, 750);
  schedule();
  const initial = watchURL(location.href);
  if (initial && new URL(location.href).searchParams.get('tvc') !== '1') location.replace(initial);
})();
