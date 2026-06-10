// Step 1: 카테고리 조회 + 견적서 ZIP 다운로드 + XLSX 파싱 → displayCategoryCode 추출
// CORS 우회: executeScript MAIN world on supplier.coupang.com tab

import { state } from './state.js';
import { $, getCoupangCookies } from './utils.js';

export async function fetchCategory() {
  const categoryId = $('f-category-id').value.trim();
  if (!categoryId) { alert('카테고리 ID를 입력해주세요'); return; }

  const btn = $('btn-fetch-category');
  btn.disabled = true;
  btn.textContent = '조회 중...';

  try {
    const cookies = await getCoupangCookies();
    if (!cookies) { alert('쿠팡 서플라이어 허브에 로그인되어 있는지 확인해주세요'); return; }
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    let resp, lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
      try {
        resp = await fetch(
          `https://supplier.coupang.com/qvt/kan-categories/search?keyword=${categoryId}&searchType=kanCategoryIds`,
          { headers: { Cookie: cookieStr, Accept: 'application/json' } }
        );
        if (resp.ok) break;
        lastErr = new Error('서버 응답 오류: ' + resp.status);
      } catch (e) { lastErr = e; }
    }
    if (!resp?.ok) throw lastErr || new Error('카테고리 조회 실패');
    const data = await resp.json();
    let items = Array.isArray(data) ? data : [];
    if (!items.length && data?.data) items = Array.isArray(data.data) ? data.data : [data.data];

    const resultEl = $('category-result');
    resultEl.innerHTML = '';
    if (items.length > 0) {
      const item = items[0];
      const fullPath = item.categoryFullPath || item.fullPath || '';
      const pathStr  = fullPath ? fullPath.split('>').map(s => s.trim()).filter(Boolean).join(' > ') : '';
      $('f-category').value = pathStr;
      saveCategoryMeta(item, resultEl);
      resultEl.classList.remove('hidden');
    } else {
      resultEl.textContent = '카테고리 경로를 찾지 못했습니다';
      resultEl.classList.remove('hidden');
    }
  } catch (e) {
    alert('카테고리 조회 오류: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '조회';
  }
}

async function fetchNoticeSchema(displayCode, tabId) {
  try {
    const results = await new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (code) => {
          try {
            const r = await fetch(`/sr/schema/api/get-default-schemaform?internalDisplayCode=${code}&useCustomizedJsonSchema=true`);
            const j = await r.json();
            const raw = j.notices || j.noticeItems || j.productNoticeItems || [];
            const noticeItems = Array.isArray(raw)
              ? raw.map(n => n.noticeItemName || n.itemName || n.name).filter(Boolean)
              : [];
            return { ok: true, noticeNumber: j.noticeNumber, noticeItems };
          } catch (e) { return { ok: false, error: e.message }; }
        },
        args: [displayCode],
      }, (r) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });
    return results?.[0]?.result ?? { noticeNumber: null, noticeItems: [] };
  } catch (e) {
    console.warn('[fetchNoticeSchema 오류]', e.message);
    return { noticeNumber: null, noticeItems: [] };
  }
}

function renderDisplayCodeSelect(candidates, itemId, resultEl, tabId, savedCode = null) {
  const existing = document.getElementById('display-code-select-wrap');
  if (existing) existing.remove();
  const wrap = document.createElement('div');
  wrap.id = 'display-code-select-wrap';
  wrap.style.cssText = 'margin-top:6px;';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'font-size:11px;color:#666;margin-bottom:4px;';
  lbl.textContent = '세부 카테고리 선택';
  wrap.appendChild(lbl);
  const sel = document.createElement('select');
  sel.style.cssText = 'width:100%;padding:6px 8px;font-size:12px;border:1px solid #d0d2d6;border-radius:6px;background:#fff;cursor:pointer;';
  candidates.forEach((c, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = c.path;
    sel.appendChild(opt);
  });

  // 이전 선택값 복원 또는 첫 번째 항목 기본 선택
  const savedIdx = savedCode != null ? candidates.findIndex(c => c.code === savedCode) : -1;
  const defaultIdx = savedIdx >= 0 ? savedIdx : 0;
  sel.value = defaultIdx;

  if (tabId && !savedCode) {
    if (state.queueData[itemId]) state.queueData[itemId].displayCategoryCode = candidates[defaultIdx].code;
    fetchNoticeSchema(candidates[defaultIdx].code, tabId).then(({ noticeNumber, noticeItems }) => {
      if (state.queueData[itemId]) {
        if (noticeNumber !== null) state.queueData[itemId].productNoticeNumber = noticeNumber;
        if (noticeItems.length > 0) state.queueData[itemId].productNoticeItems = noticeItems;
      }
    });
  }

  sel.addEventListener('change', () => {
    const c = candidates[parseInt(sel.value)];
    if (!c || !state.queueData[itemId]) return;
    state.queueData[itemId].displayCategoryCode = c.code;
    chrome.tabs.query({ url: 'https://supplier.coupang.com/*' }, (tabs) => {
      if (!tabs.length) return;
      fetchNoticeSchema(c.code, tabs[0].id).then(({ noticeNumber, noticeItems }) => {
        if (state.queueData[itemId]) {
          if (noticeNumber !== null) state.queueData[itemId].productNoticeNumber = noticeNumber;
          if (noticeItems.length > 0) state.queueData[itemId].productNoticeItems = noticeItems;
        }
      });
    });
  });
  wrap.appendChild(sel);
  resultEl.appendChild(wrap);
}

export function restoreCategoryUI(itemId) {
  const item = state.queueData[itemId];
  if (!item?.categoryCodeCandidates?.length) return;

  const resultEl = $('category-result');
  if (!resultEl) return;
  resultEl.innerHTML = '';
  resultEl.classList.remove('hidden');

  const candidates = item.categoryCodeCandidates;
  if (candidates.length === 1) {
    const info = document.createElement('div');
    info.style.cssText = 'font-size:12px;color:#555;padding:4px 2px;';
    info.textContent = candidates[0].path;
    resultEl.appendChild(info);
  } else {
    renderDisplayCodeSelect(candidates, itemId, resultEl, null, item.displayCategoryCode ?? null);
  }
}

async function saveCategoryMeta(item, resultEl) {
  const rawPath   = item.categoryFullPath || item.fullPath || '';
  const kanCatId  = item.categoryId || item.kanCategoryId;
  const snapItemId = state.currentModalItemId;
  if (state.queueData[snapItemId]) {
    state.queueData[snapItemId].categoryPath          = rawPath;
    state.queueData[snapItemId].categoryId            = kanCatId;
    state.queueData[snapItemId].productNoticeNumber   = null;
    state.queueData[snapItemId].displayCategoryCode   = null;
  }
  const existing = document.getElementById('display-code-select-wrap');
  if (existing) existing.remove();

  try {
    const hubTabs = await chrome.tabs.query({ url: 'https://supplier.coupang.com/*' });
    if (!hubTabs.length) { console.warn('[saveCategoryMeta] 서플라이어 허브 탭 없음'); return; }
    const tabId = hubTabs[0].id;

    const dlResults = await new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (kanCatId) => {
          try {
            const resp = await fetch(`/qvt/v3/kan-categories/download-quotation?leafKanCategoryIds=${kanCatId}&locale=ko`);
            if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            return { ok: true, base64: btoa(binary) };
          } catch (e) { return { ok: false, error: e.message }; }
        },
        args: [kanCatId],
      }, (r) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });

    const res = dlResults?.[0]?.result;
    if (!res?.ok) { console.warn('[download-quotation 실패]', res?.error); return; }

    const binaryStr = atob(res.base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const outerZip  = await JSZip.loadAsync(bytes);
    const xlsxEntry = Object.values(outerZip.files).find(f => f.name.endsWith('.xlsx') && !f.dir);
    if (!xlsxEntry) { console.warn('[download-quotation] XLSX 파일 없음'); return; }

    const innerZip = await JSZip.loadAsync(await xlsxEntry.async('uint8array'));
    const ssFile   = innerZip.file('xl/sharedStrings.xml');
    if (!ssFile) { console.warn('[download-quotation] sharedStrings.xml 없음'); return; }
    const ssXml = await ssFile.async('string');

    const matches    = [...ssXml.matchAll(/<t[^>]*>([^<]*>[^<]*\((\d{4,6})\))\s*<\/t>/g)];
    const candidates = [...new Map(
      matches
        .filter(m => !m[1].includes('E.g.') && m[1].includes('>'))
        .map(m => [m[2], { path: m[1].trim(), code: parseInt(m[2]) }])
    ).values()];

    if (candidates.length === 0) {
      console.warn('[download-quotation] displayCategoryCode 후보 없음');
    } else {
      if (state.queueData[snapItemId]) state.queueData[snapItemId].categoryCodeCandidates = candidates;

      if (candidates.length === 1) {
        if (state.queueData[snapItemId]) state.queueData[snapItemId].displayCategoryCode = candidates[0].code;
        const { noticeNumber: noticeNum, noticeItems } = await fetchNoticeSchema(candidates[0].code, tabId);
        if (state.queueData[snapItemId]) {
          if (noticeNum !== null) state.queueData[snapItemId].productNoticeNumber = noticeNum;
          if (noticeItems.length > 0) state.queueData[snapItemId].productNoticeItems = noticeItems;
        }
        const info = document.createElement('div');
        info.style.cssText = 'font-size:12px;color:#555;padding:4px 2px;';
        info.textContent = candidates[0].path;
        resultEl.appendChild(info);
      } else {
        renderDisplayCodeSelect(candidates, snapItemId, resultEl, tabId);
      }
    }
  } catch (e) {
    console.warn('[saveCategoryMeta 오류]', e.message);
  }
}
