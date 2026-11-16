import { DEFAULTS, MAX_SITES, normalizeHost, originsFor, findSite, registrationsFor, rulesFor, authPolicy } from './shared.js';

let queue = Promise.resolve();
const linkIntents = [];
const googleIntents = new Map();
const authBootstraps = new Map();
function clearBootstrap(tabId) {
  const item = authBootstraps.get(tabId);
  if (item) clearTimeout(item.timer);
  authBootstraps.delete(tabId);
  return item;
}
function trackAuthBootstrap(tabId, source) {
  clearBootstrap(tabId);
  const timer = setTimeout(async () => {
    if (!clearBootstrap(tabId)) return;
    try {
      const tab = await chrome.tabs.get(tabId);
      const url = tab.pendingUrl || tab.url;
      if (!authPolicy.googleAccountURL(url) && !authPolicy.isStart(url, source)) await chrome.tabs.remove(tabId);
    } catch { /* Closed login popup. */ }
  }, 10000);
  authBootstraps.set(tabId, { source, timer });
}
function rememberLink(tabId, url) {
  const now = Date.now();
  while (linkIntents.length && linkIntents[0].until < now) linkIntents.shift();
  if (linkIntents.length >= 100) linkIntents.shift();
  linkIntents.push({ tabId, url, until: now + 30000 });
}
function consumeLink(tabId, url) {
  const index = linkIntents.findIndex(i => i.tabId === tabId && i.url === url && i.until >= Date.now());
  if (index < 0) return false;
  linkIntents.splice(index, 1); return true;
}
const serial = operation => {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
};
async function readSites() {
  return (await chrome.storage.local.get({ sites: [] })).sites.map(site => ({ ...DEFAULTS, ...site }));
}
async function usableSites(sites) {
  return Promise.all(sites.map(async s => ({ ...s, granted: await chrome.permissions.contains({ origins: originsFor(s.host) }) })));
}
async function reconcile(sites) {
  const usable = (await usableSites(sites)).map(s => ({ ...s, enabled: s.enabled && s.granted }));
  const desired = registrationsFor(usable);
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const ids = registered.filter(s => s.id.startsWith('still-')).map(s => s.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  if (desired.length) await chrome.scripting.registerContentScripts(desired);
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldRules.map(r => r.id), addRules: rulesFor(usable) });
}
async function applyLive(previous, next) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !findSite([...previous, ...next], tab.url)) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: 'MAIN',
        func: entries => {
          const config = [...entries].sort((a, b) => b.host.length - a.host.length).find(s => location.hostname === s.host || location.hostname.endsWith(`.${s.host}`));
          globalThis.__stillShieldV1?.update({ active: !!config?.enabled, navigation: !!config?.navigation, video: !!config?.video, holdSpeed: config?.holdSpeed !== false });
        }, args: [next] });
    } catch { /* Closed tab, restricted frame, or permission already revoked. Reload completes application. */ }
  }
}
async function commit(previous, next) {
  try {
    await reconcile(next);
    await chrome.storage.local.set({ sites: next });
    await applyLive(previous, next);
  } catch (error) {
    await reconcile(previous).catch(() => {});
    throw error;
  }
}
async function handle(message, sender) {
  if (message?.type === 'GOOGLE_AUTH_INTENT') {
    const site = findSite(await readSites(), sender.url);
    if (!sender.tab?.id || !site?.enabled || !site.navigation || !message.trustedClick) throw new Error('Yêu cầu không hợp lệ.');
    const now = Date.now();
    for (const [id, until] of googleIntents) if (until < now) googleIntents.delete(id);
    if (googleIntents.size >= 100) googleIntents.delete(googleIntents.keys().next().value);
    googleIntents.set(sender.tab.id, now + 8000);
    return {};
  }
  // Website content scripts have only this narrow, trusted-click navigation operation.
  if (message?.type === 'OPEN_LINK' || message?.type === 'LINK_INTENT') {
    const site = findSite(await readSites(), sender.url);
    if (!sender.tab?.id || !site?.enabled || !site.navigation || !message.trustedClick) throw new Error('Trang chưa được bật bảo vệ.');
    const url = new URL(message.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Liên kết không được hỗ trợ.');
    rememberLink(sender.tab.id, url.href);
    if (message.type === 'LINK_INTENT') return {};
    if (message.newTab || sender.frameId !== 0) await chrome.tabs.create({ url: url.href, openerTabId: sender.tab.id, active: !message.background });
    else await chrome.tabs.update(sender.tab.id, { url: url.href });
    return {};
  }
  if (!sender.url?.startsWith(chrome.runtime.getURL('ui/'))) throw new Error('Yêu cầu không hợp lệ.');
  if (message?.type === 'GET_STATE') return { sites: await usableSites(await readSites()) };
  return serial(async () => {
    const sites = await readSites();
    if (message?.type === 'ADD_SITE') {
      const host = normalizeHost(message.host);
      if (sites.some(s => s.host === host)) throw new Error('Tên miền này đã có trong danh sách.');
      if (sites.length >= MAX_SITES) throw new Error(`Tối đa ${MAX_SITES} tên miền.`);
      if (!await chrome.permissions.contains({ origins: originsFor(host) })) throw new Error('Chưa được cấp quyền cho tên miền này.');
      await commit(sites, [...sites, { host, ...DEFAULTS }]);
      if (message.tabId) {
        const tab = await chrome.tabs.get(message.tabId);
        if (findSite([{ host }], tab.url)) await chrome.tabs.reload(tab.id);
      }
    } else if (message?.type === 'UPDATE_SITE') {
      const host = normalizeHost(message.host);
      if (!sites.some(s => s.host === host)) throw new Error('Không tìm thấy tên miền.');
      const patch = {};
      for (const key of ['enabled', 'navigation', 'video', 'holdSpeed']) if (typeof message.patch?.[key] === 'boolean') patch[key] = message.patch[key];
      await commit(sites, sites.map(s => s.host === host ? { ...s, ...patch } : s));
    } else if (message?.type === 'REMOVE_SITE') {
      const host = normalizeHost(message.host);
      const next = sites.filter(s => s.host !== host);
      await commit(sites, next);
      // Host access is granted once at install. Removing an entry only removes its protection.
    } else throw new Error('Thao tác chưa được hỗ trợ.');
    return { sites: await usableSites(await readSites()) };
  });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender).then(result => sendResponse({ ok: true, ...result }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});
const restore = () => serial(async () => reconcile(await readSites())).catch(error => console.error('BetterFilms:', error));
chrome.runtime.onInstalled.addListener(restore);
chrome.runtime.onStartup.addListener(restore);
chrome.permissions.onRemoved.addListener(restore);
// Last-resort protection for popups created from clean/cross-origin child frames.
// This closes the tab after Chrome creates it; page-world hooks normally stop it earlier.
chrome.webNavigation.onCreatedNavigationTarget.addListener(async event => {
  try {
    if (consumeLink(event.sourceTabId, event.url)) return;
    const tab = await chrome.tabs.get(event.sourceTabId);
    const site = findSite(await readSites(), tab.url);
    if (!site?.enabled || !site.navigation) return;
    const source = new URL(tab.url).origin;
    if (authPolicy.isStart(event.url, source)) { googleIntents.delete(event.sourceTabId); return; }
    if (!event.url || event.url === 'about:blank') {
      // Let a trusted click message reach the worker before evaluating an SDK's
      // pre-opened blank window. Only this single target is provisionally allowed.
      await new Promise(resolve => setTimeout(resolve, 100));
      let widget = false;
      if (event.sourceFrameId > 0 && chrome.webNavigation.getFrame) {
        try {
          const frame = await chrome.webNavigation.getFrame({ tabId: event.sourceTabId, frameId: event.sourceFrameId });
          widget = authPolicy.googleWidget(frame?.url);
        } catch { /* A disappeared frame does not justify keeping an unknown popup. */ }
      }
      const target = await chrome.tabs.get(event.tabId);
      const destination = target?.pendingUrl || target?.url;
      if (authPolicy.isStart(destination, source)) { googleIntents.delete(event.sourceTabId); return; }
      const intended = (googleIntents.get(event.sourceTabId) || 0) >= Date.now();
      if (intended || widget) {
        googleIntents.delete(event.sourceTabId);
        if (authPolicy.googleAccountURL(destination)) return;
        if (!destination || destination === 'about:blank') { trackAuthBootstrap(event.tabId, source); return; }
      }
    }
    await chrome.tabs.remove(event.tabId);
  } catch { /* Tab already closed or source inaccessible. */ }
});
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.url || !authBootstraps.has(tabId)) return;
  const item = authBootstraps.get(tabId);
  if (change.url === 'about:blank') return;
  clearBootstrap(tabId);
  if (!authPolicy.googleAccountURL(change.url) && !authPolicy.isStart(change.url, item.source)) {
    try { await chrome.tabs.remove(tabId); } catch {}
  }
});
chrome.tabs.onRemoved.addListener(tabId => { clearBootstrap(tabId); googleIntents.delete(tabId); });
