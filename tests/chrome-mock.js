import { findSite } from '../extension/shared.js';
export function event() {
  const listeners = [];
  return { listeners, addListener(fn) { listeners.push(fn); }, emit(...args) { for (const fn of listeners) fn(...args); } };
}
export function mockChrome(initial = []) {
  const db = { sites: structuredClone(initial) }, granted = new Set(), scripts = [], rules = [], calls = [], tabs = [{ id: 7, url: 'https://mflix.store/' }];
  const onMessage = event(), onInstalled = event(), onStartup = event(), onRemoved = event(), onChanged = event();
  const chrome = {
    storage: { local: {
      async get(defaults) { return { ...defaults, ...structuredClone(db) }; },
      async set(value) { Object.assign(db, structuredClone(value)); onChanged.emit({ sites: { newValue: value.sites } }, 'local'); },
    }, onChanged },
    permissions: { async contains({ origins }) { return origins.every(o => granted.has(o)); }, async request({ origins }) { calls.push(['request', origins]); origins.forEach(o => granted.add(o)); return true; }, async remove({ origins }) { calls.push(['remove-permission', origins]); origins.forEach(o => granted.delete(o)); onRemoved.emit({ origins }); return true; }, onRemoved },
    scripting: {
      async getRegisteredContentScripts() { return structuredClone(scripts); },
      async unregisterContentScripts({ ids }) { calls.push(['unregister', ids]); for (let i = scripts.length - 1; i >= 0; i--) if (ids.includes(scripts[i].id)) scripts.splice(i, 1); },
      async registerContentScripts(entries) { calls.push(['register', entries]); scripts.push(...structuredClone(entries)); },
      async executeScript(params) { calls.push(['execute', params]); return []; },
    },
    declarativeNetRequest: { async getDynamicRules() { return structuredClone(rules); }, async updateDynamicRules({ removeRuleIds, addRules }) { calls.push(['dnr', addRules]); for (let i = rules.length - 1; i >= 0; i--) if (removeRuleIds.includes(rules[i].id)) rules.splice(i, 1); rules.push(...structuredClone(addRules)); } },
    tabs: { async query(query) { return query?.active ? [tabs[0]] : structuredClone(tabs); }, async get(id) { return structuredClone(tabs.find(t => t.id === id)); }, async reload(id) { calls.push(['reload', id]); }, async create(params) { calls.push(['create-tab', params]); }, async update(id, params) { calls.push(['update-tab', id, params]); }, onUpdated: event(), onRemoved: event() },
    webNavigation: { onCreatedNavigationTarget: event(), async getFrame() { return null; } },
    runtime: { getURL(file) { return `chrome-extension://still-test/${file}`; }, onMessage, onInstalled, onStartup, async openOptionsPage() { calls.push(['options']); } },
  };
  const uiSender = { url: chrome.runtime.getURL('ui/popup.html') };
  chrome.tabs.remove = async id => { calls.push(['close-tab', id]); };
  function request(message, sender = uiSender) {
    return new Promise(resolve => onMessage.listeners[0](message, sender, resolve));
  }
  return { chrome, db, granted, scripts, rules, calls, tabs, request, findSite };
}
