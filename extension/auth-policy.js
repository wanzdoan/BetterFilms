// Shared policy for page scripts, the isolated bridge and the service worker.
// Loaded as a classic content script and as a side-effect module in the worker.
(() => {
  'use strict';
  if (globalThis.__betterFilmsAuthPolicy) return;
  const parse = (value, base) => {
    try {
      const url = new URL(String(value), base);
      return !url.username && !url.password && ['http:', 'https:'].includes(url.protocol) ? url : null;
    } catch { return null; }
  };
  const googleAccountURL = value => {
    const url = parse(value);
    return !!url && url.protocol === 'https:' && url.hostname === 'accounts.google.com' && !url.port;
  };
  function googleEntry(url, depth = 0) {
    if (!googleAccountURL(url.href) || depth > 2) return false;
    if (/^\/(?:o\/oauth2\/(?:v2\/auth|auth)|gsi\/select|signin\/oauth)(?:\/|$)/.test(url.pathname)) {
      return !!url.searchParams.get('client_id');
    }
    if (/^\/(?:AccountChooser|ServiceLogin)\/?$/.test(url.pathname)) {
      const next = parse(url.searchParams.get('continue'));
      return !!next && googleEntry(next, depth + 1);
    }
    return false;
  }
  function kind(value, source) {
    const url = parse(value, source), origin = parse(source);
    if (!url) return null;
    if (googleEntry(url)) return 'google';
    if (origin && url.origin === origin.origin && /^\/(?:api\/auth\/(?:signin\/google|google(?:\/(?:login|start|redirect))?)|auth\/google(?:\/(?:login|start|redirect))?|login\/google|oauth\/google)\/?$/.test(url.pathname)) return 'local';
    if (url.protocol === 'https:' && /^\/__\/auth\/handler\/?$/.test(url.pathname) &&
        url.searchParams.get('providerId') === 'google.com' &&
        /^(?:signIn|link|reauth)ViaPopup$/.test(url.searchParams.get('authType') || '') &&
        ((origin && url.origin === origin.origin) || (!url.port && /^[a-z0-9-]+\.(?:firebaseapp\.com|web\.app)$/.test(url.hostname)))) return 'firebase';
    return null;
  }
  function googleWidget(value) {
    const url = parse(value);
    return !!url && googleAccountURL(url.href) && /^\/gsi\/(?:button|iframe)(?:\/|$)/.test(url.pathname) && !!url.searchParams.get('client_id');
  }
  function googleControl(element) {
    const control = element?.closest?.('button,a,input[type="button"],input[type="submit"],[role="button"],.g_id_signin,[data-provider="google"]');
    if (!control) return false;
    if (control.matches('.g_id_signin,[data-provider="google"]')) return true;
    const label = `${control.textContent || ''} ${control.getAttribute('aria-label') || ''} ${control.getAttribute('title') || ''} ${control.getAttribute('value') || ''}`
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
    return /\bgoogle\b/.test(label) && /sign\s*in|log\s*in|login|dang\s*nhap|continue|tiep\s*tuc/.test(label);
  }
  // RE2-compatible exception for Firebase's Google popup handler only.
  const firebaseRule = '^https://[a-z0-9-]+[.](firebaseapp[.]com|web[.]app)/__/auth/handler[?]([^#]*&)?providerId=google[.]com(&|$)';
  Object.defineProperty(globalThis, '__betterFilmsAuthPolicy', {
    value: Object.freeze({ kind, isStart: (value, source) => !!kind(value, source), googleAccountURL, googleWidget, googleControl, firebaseRule }),
  });
})();
