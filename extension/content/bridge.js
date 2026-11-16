(() => {
  'use strict';
  // This world keeps access to chrome.* and real isTrusted events away from the page.
  if (globalThis.__stillBridge) return;
  globalThis.__stillBridge = true;
  let current = null;
  const auth = globalThis.__betterFilmsAuthPolicy;
  const refresh = async () => {
    const { sites = [] } = await chrome.storage.local.get({ sites: [] });
    current = sites.sort((a, b) => b.host.length - a.host.length).find(s => location.hostname === s.host || location.hostname.endsWith(`.${s.host}`));
  };
  refresh();
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.sites) refresh(); });
  function directLink(event) {
    if (!event.isTrusted || !current?.enabled || !current.navigation) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    if (event.type === 'click' && event.button !== 0) return;
    const el = event.composedPath().find(n => n instanceof Element);
    if (event.type === 'click' && el && auth.googleControl(el) && el.getClientRects().length) {
      chrome.runtime.sendMessage({ type: 'GOOGLE_AUTH_INTENT', trustedClick: true }).catch(() => {});
    }
    const a = el?.closest('a[href]');
    if (!a || a.hasAttribute('download') || !a.getClientRects().length) return;
    let u;
    try { u = new URL(a.href); } catch { return; }
    const newTab = a.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
    if (!['http:', 'https:'].includes(u.protocol) || (u.origin === location.origin && !newTab && event.type !== 'contextmenu')) return;
    const rect = a.getBoundingClientRect(), style = getComputedStyle(a);
    const meaningful = a.textContent.trim() || a.querySelector('img,svg,picture');
    const overlay = ['absolute', 'fixed'].includes(style.position) && rect.width >= innerWidth * .8 && rect.height >= innerHeight * .8;
    if (!meaningful || overlay || (style.opacity !== '' && Number(style.opacity) === 0) || style.visibility === 'hidden') return;
    // OAuth links must retain native opener/postMessage behavior, not tabs.create.
    if (auth.isStart(u.href, location.href)) return;
    if (event.type === 'contextmenu') {
      chrome.runtime.sendMessage({ type: 'LINK_INTENT', trustedClick: true, url: u.href }).catch(() => {});
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    // Extension-origin navigation bypasses the site's initiator-scoped DNR block.
    chrome.runtime.sendMessage({ type: 'OPEN_LINK', trustedClick: true, url: u.href,
      newTab,
      background: (event.ctrlKey || event.metaKey || event.button === 1) && !event.shiftKey,
    }).then(response => {
      if (!response?.ok) console.warn('BetterFilms:', response?.error || 'Không mở được liên kết.');
    }).catch(() => {});
  }
  window.addEventListener('click', directLink, { capture: true });
  window.addEventListener('auxclick', directLink, { capture: true });
  window.addEventListener('contextmenu', directLink, { capture: true });
})();
