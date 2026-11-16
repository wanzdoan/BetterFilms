import './auth-policy.js';
export const authPolicy = globalThis.__betterFilmsAuthPolicy;
export const MAX_SITES = 100;
export const DEFAULTS = Object.freeze({ enabled: true, navigation: true, video: true, holdSpeed: true });

export function normalizeHost(input) {
  let text = String(input ?? '').trim();
  if (!text || text.length > 2048 || /\s/.test(text)) throw new Error('Nhập tên miền hoặc địa chỉ website hợp lệ.');
  if (text.startsWith('*.')) text = text.slice(2);
  const url = new URL(text.includes('://') ? text : `https://${text}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new Error('Chỉ hỗ trợ tên miền HTTP/HTTPS, không kèm tài khoản hoặc cổng.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.length > 253 || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host) ||
      host.split('.').some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
    throw new Error('Tên miền chưa hợp lệ, ví dụ: example.com.');
  }
  if (/^\d+(\.\d+){3}$/.test(host)) throw new Error('Bản này hỗ trợ tên miền, chưa hỗ trợ địa chỉ IP.');
  return host;
}
export function matchesHost(host, base) { return host === base || host.endsWith(`.${base}`); }
export function findSite(sites, url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return [...sites].sort((a, b) => b.host.length - a.host.length).find(s => matchesHost(parsed.hostname, s.host)) ?? null;
  } catch { return null; }
}
export function originsFor(host) { return [`http://*.${host}/*`, `https://*.${host}/*`]; }
export function activeSites(sites) {
  // A paused child must not inherit the broader parent's injection or DNR rule.
  return sites.filter(s => s.enabled);
}
export function registrationsFor(sites) {
  return activeSites(sites).flatMap((site, index) => {
    const childExclusions = sites.filter(s => s.host !== site.host && matchesHost(s.host, site.host)).flatMap(s => originsFor(s.host));
    const base = { matches: originsFor(site.host), excludeMatches: childExclusions,
      allFrames: true, matchOriginAsFallback: true, runAt: 'document_start', persistAcrossSessions: true };
    const files = ['auth-policy.js', 'content/core.js'];
    if (site.navigation) files.push('content/navigation.js');
    if (site.video) files.push('content/video.js');
    if (site.holdSpeed !== false) files.push('content/hold-speed.js');
    return [{ ...base, id: `still-main-${index}`, world: 'MAIN', js: files },
      { ...base, id: `still-bridge-${index}`, world: 'ISOLATED', js: ['auth-policy.js', 'content/bridge.js'] }];
  });
}
export function rulesFor(sites) {
  return activeSites(sites).filter(s => s.navigation).flatMap((site, index) => {
    const excluded = sites.filter(s => s.host !== site.host && matchesHost(s.host, site.host)).map(s => s.host);
    return [{
    id: index + 1, priority: 1, action: { type: 'block' },
    condition: { initiatorDomains: [site.host],
      ...(sites.some(s => s.host !== site.host && matchesHost(s.host, site.host)) ? {
        excludedInitiatorDomains: sites.filter(s => s.host !== site.host && matchesHost(s.host, site.host)).map(s => s.host),
      } : {}),
      excludedRequestDomains: [site.host, 'accounts.google.com'], resourceTypes: ['main_frame'], regexFilter: '^https?://' },
    }, {
      id: 10001 + index, priority: 2, action: { type: 'allow' },
      condition: { initiatorDomains: [site.host], ...(excluded.length ? { excludedInitiatorDomains: excluded } : {}),
        resourceTypes: ['main_frame'], regexFilter: authPolicy.firebaseRule },
    }];
  });
}
