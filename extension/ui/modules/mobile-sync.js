import { state } from './state.js';
import { appendGlobalLog } from './utils.js';

let _onCandidateAdded = null;

export function initMobileSync({ onCandidateAdded }) {
  _onCandidateAdded = onCandidateAdded;
}

// 쿠팡 페이지를 백그라운드 탭으로 열고 내부에서 데이터 추출 (1688 스크래퍼와 동일 방식)
export async function extractCoupangData(url) {
  return new Promise((resolve) => {
    let tabId = null;
    let winId = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (winId !== null) chrome.windows.remove(winId).catch(() => {});
      resolve(result || {});
    };

    const timeout = setTimeout(() => finish({}), 30000);

    const onUpdated = (updatedId, changeInfo) => {
      if (updatedId !== tabId || changeInfo.status !== 'complete') return;

      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async () => {
          // 1. JSON-LD로 상품명·가격 즉시 추출 (폴링 불필요)
          let productName = null;
          let price = null;
          for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
              const ld = JSON.parse(el.textContent);
              const offers = ld.offers || ld['@graph']?.find?.(n => n.offers)?.offers;
              if (!productName && ld.name) productName = ld.name;
              if (!price && offers) {
                const p = offers.price ?? offers.lowPrice;
                if (p) price = Number(String(p).replace(/,/g, ''));
              }
              if (productName && price) break;
            } catch {}
          }

          // 2. JSON-LD 실패 시 dataLayer 폴링 폴백 (최대 2초)
          if (!productName || !price) {
            const getDataLayerItem = () => {
              if (!Array.isArray(window.dataLayer)) return null;
              for (const entry of window.dataLayer) {
                const items = entry?.ecommerce?.items;
                if (entry.event === 'view_item' && Array.isArray(items) && items[0]) return items[0];
              }
              return null;
            };
            const start = Date.now();
            let dlItem = null;
            while (Date.now() - start < 2000) {
              dlItem = getDataLayerItem();
              if (dlItem) break;
              await new Promise(r => setTimeout(r, 200));
            }
            if (dlItem) {
              if (!productName) productName = dlItem.item_name || null;
              if (!price && dlItem.price != null) price = Number(dlItem.price);
            }
          }

          // 3. og:image 썸네일
          let thumbnailUrl = document.querySelector('meta[property="og:image"]')?.content || null;
          if (thumbnailUrl?.startsWith('//')) thumbnailUrl = 'https:' + thumbnailUrl;

          // 3. productId (URL에서 추출)
          const pidMatch = location.href.match(/\/vp\/products\/(\d+)/)
                        || location.href.match(/[?&]itemId=(\d+)/);
          const productId = pidMatch?.[1] || null;

          let categoryId = null;
          let estimatedMonthlySales = 0;

          if (productId) {
            // 4. categoryId — review/batch API (coupang_search.js의 fetchCategoryId와 동일 방식)
            try {
              const batchResp = await fetch(`/next-api/review/batch?productId=${productId}&viRoleCode=3`);
              if (batchResp.ok) {
                const batchData = await batchResp.json();
                const id = batchData?.reviewable?.contents?.categoryId;
                if (id) categoryId = String(id);
              }
            } catch {}

            // 5. 월판매량 — review 페이지네이션 × 10 (coupang_search.js의 countRecent30DaysReviews와 동일 방식)
            let count = 0;
            let page = 1;
            const maxPages = 33;
            const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
            while (page <= maxPages) {
              try {
                const rUrl = `/next-api/review?productId=${productId}&page=${page}&size=30&sortBy=DATE_DESC&viRoleCode=3&ratingSummary=true&ratings=&market=`;
                const rResp = await fetch(rUrl, { headers: { Accept: 'application/json' } });
                if (!rResp.ok) break;
                const rData = await rResp.json();
                const reviews = rData?.rData?.paging?.contents;
                if (!reviews || reviews.length === 0) break;
                let foundOlder = false;
                for (const review of reviews) {
                  if (review.createdAt >= cutoff) count++;
                  else { foundOlder = true; break; }
                }
                if (foundOlder || rData.rData.paging.isNext === false) break;
                page++;
              } catch { break; }
            }
            estimatedMonthlySales = count * 10;
          }

          return { productName, price, thumbnailUrl, categoryId, estimatedMonthlySales };
        },
      }, (results) => {
        void chrome.runtime.lastError; // 소비 — 미소비 시 "Unchecked runtime.lastError" 경고
        clearTimeout(timeout);
        finish(results?.[0]?.result || {});
      });
    };

    chrome.windows.create({ url, type: 'popup', width: 1, height: 1, left: -2000, top: -2000, focused: false }, (win) => {
      winId = win.id;
      tabId = win.tabs[0].id;
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

export async function syncFromSheet() {
  const { mobileSyncSettings } = await chrome.storage.local.get('mobileSyncSettings');
  const webhookUrl = mobileSyncSettings?.webhookUrl?.trim();
  if (!webhookUrl) return;

  try {
    const res = await fetch(`${webhookUrl}?action=pending`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return;

    const doneRowIds = [];
    let addedCount = 0;

    // 처리할 row 선별 + doneRowIds 수집
    const toProcess = [];
    for (const row of rows) {
      const url = (row.url || '').trim();
      if (!url) continue;
      doneRowIds.push(row.rowId);
      const already = state.sourcingCandidates.some(c => c.coupangUrl === url || c.url === url);
      if (!already) toProcess.push({ row, url });
    }

    // 순차 처리 (병렬 시 로드 실패 디버깅용)
    const metaResults = [];
    for (const { url } of toProcess) {
      const result = await extractCoupangData(url).catch(() => ({}));
      metaResults.push({ status: 'fulfilled', value: result });
    }

    for (let i = 0; i < toProcess.length; i++) {
      const { row, url } = toProcess[i];
      const meta = metaResults[i].status === 'fulfilled' ? metaResults[i].value : {};

      const candidate = {
        id: 'mobile_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        coupangUrl: url,
        productName: meta.productName || row.title || url,
        price: meta.price || null,
        thumbnailUrl: meta.thumbnailUrl || null,
        categoryId: meta.categoryId || null,
        estimatedMonthlySales: meta.estimatedMonthlySales || 0,
        status: 'pending',
        source: 'mobile',
        addedAt: Date.now(),
      };

      if (_onCandidateAdded) _onCandidateAdded(candidate);
      addedCount++;
    }

    chrome.storage.local.set({ sourcingCandidates: state.sourcingCandidates });

    await fetch(`${webhookUrl}?action=done&rowIds=${doneRowIds.join(',')}`);

    if (addedCount > 0) appendGlobalLog(`📲 모바일 후보 ${addedCount}개 가져옴`);
  } catch (e) {
    appendGlobalLog(`📲 모바일 동기화 실패: ${e.message}`);
  }
}

export async function pushLedgerToSheet({ url1688, rows }) {
  const { mobileSyncSettings } = await chrome.storage.local.get('mobileSyncSettings');
  const webhookUrl = mobileSyncSettings?.webhookUrl?.trim();
  if (!webhookUrl) return { ok: false, noWebhook: true };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${webhookUrl}?action=ledger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url1688, rows }),
      });
      if (res.ok) {
        appendGlobalLog('📋 소싱 원장 시트 기록 완료');
        return { ok: true };
      }
    } catch (e) {
      if (attempt === 2) {
        appendGlobalLog('📋 소싱 원장 시트 기록 실패: ' + e.message);
        return { ok: false, error: e.message };
      }
    }
    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
  }
  return { ok: false };
}

export async function saveMobileSyncSettings(webhookUrl, geminiApiKey = '') {
  const prev = (await chrome.storage.local.get('mobileSyncSettings')).mobileSyncSettings || {};
  await chrome.storage.local.set({ mobileSyncSettings: { ...prev, webhookUrl, geminiApiKey } });
}

export async function loadMobileSyncSettings() {
  const { mobileSyncSettings } = await chrome.storage.local.get('mobileSyncSettings');
  return mobileSyncSettings || { webhookUrl: '' };
}
