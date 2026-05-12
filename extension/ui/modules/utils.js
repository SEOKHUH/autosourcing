// 순수 유틸 함수 + DOM 헬퍼

export const $ = (id) => document.getElementById(id);

export function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function statusLabel(s) {
  return { waiting:'대기', scraping:'크롤링', review:'검토', registering:'등록중', done:'완료', error:'오류' }[s] || s;
}

export function statusIcon(s) {
  return { waiting:'⏳', scraping:'🔍', review:'✏️', registering:'⬆️', done:'✅', error:'❌' }[s] || '📦';
}

export function getCoupangCookies() {
  return new Promise(resolve => {
    chrome.cookies.getAll({ domain: '.coupang.com' }, (cookies) => {
      if (!cookies || !cookies.length) return resolve(null);
      const obj = {};
      cookies.forEach(c => { obj[c.name] = c.value; });
      resolve(obj);
    });
  });
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function dataUrlToArrayBuffer(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:50px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:7px 16px;border-radius:20px;font-size:12px;z-index:10000;pointer-events:none;';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

export function appendGlobalLog(text) {
  const content = $('log-bar-content');
  const last    = $('log-bar-last');
  content.textContent += (content.textContent ? '\n' : '') + text;
  content.scrollTop = content.scrollHeight;
  last.textContent  = text;
}

export function toggleLogBar() {
  const content  = $('log-bar-content');
  const btn      = $('btn-log-toggle');
  const expanded = !content.classList.contains('hidden');
  content.classList.toggle('hidden', expanded);
  btn.textContent = expanded ? '▲' : '▼';
}
