import { $, send, notice, addSite, manualForm } from './common.js';
import { findSite, normalizeHost } from '../shared.js';
let tab, sites = [], current, host;
function render() {
  current = findSite(sites, tab?.url);
  const active = current?.enabled && current.granted;
  $('current-host').textContent = host || 'Trang này không hỗ trợ';
  $('current-host').title = host || '';
  $('current-status').classList.toggle('active', !!active);
  $('status-text').textContent = active ? 'Đang bảo vệ' : current ? (current.granted ? 'Đã tạm dừng' : 'Cần cấp lại quyền') : 'Chưa bật bảo vệ';
  $('current-description').hidden = !!host;
  $('current-description').textContent = host ? '' : 'Mở một website để thêm.';
  $('add-current').hidden = !!current?.granted;
  $('add-current').disabled = !host;
  $('add-current').textContent = current ? 'Bật bảo vệ' : 'Bảo vệ trang này';
  $('site-actions').hidden = !current?.granted;
  $('pause-current').textContent = current?.enabled ? 'Tạm dừng' : 'Tiếp tục';
  $('protections').hidden = !current;
  for (const key of ['navigation', 'video', 'holdSpeed']) { $(key).checked = key === 'holdSpeed' ? current?.holdSpeed !== false : !!current?.[key]; $(key).disabled = !active; }
  $('site-count').textContent = String(sites.length);
}
async function load() { sites = (await send({ type: 'GET_STATE' })).sites; render(); }
$('manage').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('add-current').addEventListener('click', async () => {
  $('add-current').disabled = true;
  try {
    if (current) {
      if (!current.granted) throw new Error('Bật quyền truy cập website trong cài đặt trình duyệt.');
      await send({ type: 'UPDATE_SITE', host: current.host, patch: { enabled: true } });
      await chrome.tabs.reload(tab.id);
    } else await addSite(host, tab.id);
    await load(); notice('Đã bật bảo vệ.');
  } catch (error) { notice(error.message, true); render(); }
});
$('pause-current').addEventListener('click', async () => {
  try { await send({ type: 'UPDATE_SITE', host: current.host, patch: { enabled: !current.enabled } }); await load(); notice('Đã lưu. Tải lại trang để áp dụng.'); }
  catch (error) { notice(error.message, true); }
});
$('reload-current').addEventListener('click', () => chrome.tabs.reload(tab.id));
for (const key of ['navigation', 'video', 'holdSpeed']) $(key).addEventListener('change', async () => {
  try { await send({ type: 'UPDATE_SITE', host: current.host, patch: { [key]: $(key).checked } }); await load(); notice('Đã lưu. Tải lại trang để áp dụng.'); }
  catch (error) { notice(error.message, true); render(); }
});
try {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { host = normalizeHost(tab?.url); } catch { host = null; }
  await load();
} catch (error) { notice(error.message, true); $('current-host').textContent = 'Chưa đọc được website'; }
manualForm(load, tab?.id);
