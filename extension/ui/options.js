import { $, send, notice, manualForm } from './common.js';
let sites = [];
function text(tag, value, className) { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; }
async function update(site, patch) {
  try { sites = (await send({ type: 'UPDATE_SITE', host: site.host, patch })).sites; render(); notice('Đã lưu. Tải lại website để áp dụng đầy đủ.'); }
  catch (error) { notice(error.message, true); render(); }
}
function toggle(site, key, title, description) {
  const label = text('label', '', 'switch-row'), words = document.createElement('span');
  words.append(text('strong', title), text('span', description, 'small muted'));
  const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'switch'; input.setAttribute('role', 'switch'); input.checked = key === 'holdSpeed' ? site[key] !== false : site[key]; input.disabled = !site.granted;
  input.addEventListener('change', () => update(site, { [key]: input.checked })); label.append(words, input); return label;
}
function row(site) {
  const el = text('section', '', 'site-entry'), heading = text('div', '', 'site-heading'), identity = text('div', '', 'site-identity'), actions = text('div', '', 'site-controls');
  identity.append(text('h3', site.host), text('p', !site.granted ? 'Cần cấp lại quyền' : site.enabled ? 'Đang bảo vệ' : 'Đã tạm dừng', site.enabled && site.granted ? 'active' : ''));
  const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.className = 'switch'; enabled.setAttribute('role', 'switch'); enabled.setAttribute('aria-label', `Bảo vệ ${site.host}`); enabled.checked = site.enabled; enabled.disabled = !site.granted;
  enabled.addEventListener('change', () => update(site, { enabled: enabled.checked }));
  const remove = text('button', 'Xóa', 'remove'); remove.setAttribute('aria-label', `Xóa ${site.host}`);
  remove.addEventListener('click', async () => { remove.disabled = true; try { sites = (await send({ type: 'REMOVE_SITE', host: site.host })).sites; render(); notice(`Đã xóa ${site.host}.`); } catch (error) { notice(error.message, true); remove.disabled = false; } });
  actions.append(enabled, remove); heading.append(identity, actions); el.append(heading);
  const details = document.createElement('details'), summary = text('summary', 'Thiết lập cho website'), settings = text('div', '', 'site-settings');
  details.dataset.host = site.host;
  settings.append(toggle(site, 'navigation', 'Chặn nhảy tab', ''), toggle(site, 'video', 'Bỏ qua TVC', ''), toggle(site, 'holdSpeed', 'Giữ để phát 2×', ''));
  details.append(summary, settings); el.append(details);
  if (!site.granted) {
    el.append(text('p', 'Bật quyền truy cập website trong cài đặt trình duyệt.', 'small muted'));
  }
  return el;
}
function render() {
  const open = new Set([...document.querySelectorAll('details[open]')].map(el => el.dataset.host));
  const filter = $('search').value.trim().toLowerCase();
  const shown = sites.filter(s => s.host.includes(filter)).sort((a, b) => a.host.localeCompare(b.host));
  $('sites').replaceChildren(...shown.map(row));
  for (const details of document.querySelectorAll('details')) details.open = open.has(details.dataset.host);
  $('total').textContent = `${sites.length} website`;
  $('empty').hidden = sites.length !== 0;
  $('no-results').hidden = !sites.length || shown.length !== 0;
}
async function load() { sites = (await send({ type: 'GET_STATE' })).sites; render(); }
function route() {
  const guide = location.hash === '#guide';
  $('guide-view').hidden = !guide; $('websites-view').hidden = guide;
  for (const a of document.querySelectorAll('nav a')) if (a.hash === (guide ? '#guide' : '#websites')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
}
$('search').addEventListener('input', render);
$('focus-add').addEventListener('click', () => $('domain').focus());
window.addEventListener('hashchange', route); route();
manualForm(load);
try { await load(); } catch (error) { notice(error.message, true); }
