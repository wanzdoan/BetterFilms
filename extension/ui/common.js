import { normalizeHost } from '../shared.js';
export const $ = id => document.getElementById(id);
let noticeTimer;
export async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Không kết nối được BetterFilms. Hãy mở lại tiện ích.');
  return response;
}
export function notice(text, error = false) {
  const el = $('message');
  el.textContent = text; el.classList.toggle('error', error); el.hidden = !text;
  clearTimeout(noticeTimer);
  if (document.body.classList.contains('popup') && text && !error) noticeTimer = setTimeout(() => { el.hidden = true; }, 3000);
}
export async function addSite(input, tabId) {
  const host = normalizeHost(input);
  return send({ type: 'ADD_SITE', host, tabId });
}
export function manualForm(onAdded, currentTabId) {
  $('manual-form').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = event.submitter || $('manual-form').querySelector('button[type=submit],button');
    submit.disabled = true;
    try { const result = await addSite($('domain').value, currentTabId); $('domain').value = ''; await onAdded(result); notice('Đã thêm website.'); }
    catch (error) { notice(error.message, true); }
    finally { submit.disabled = false; }
  });
}
