/**
 * service-worker.js — 헤오르 AutoSourcing Service Worker (Manifest V3)
 *
 * 역할:
 *  - UI 탭 열기 (툴바 아이콘 클릭 시)
 *  - content script ↔ UI 탭 메시지 중계
 *  - 1688 이미지 다운로드 (fetch + chrome.downloads)
 *  - IndexedDB 대신 chrome.storage.session (이미지 바이너리는 IndexedDB, UI에서 관리)
 *  - keepAlive: chrome.alarms로 SW 30초 종료 방지
 */

// ── keepAlive: MV3 Service Worker 30초 종료 방지 ──────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // no-op: SW를 주기적으로 재활성화
  }
});

// ── 1688 탭 로딩 감지 → 즉시 페이지 인터셉터 주입 ────────────────────────────
// document_start 타이밍에 executeScript(MAIN world)로 fetch/XHR 후킹.
// 이렇게 해야 페이지의 API 호출을 놓치지 않음.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  const url = tab.url || changeInfo.url || '';
  if (!url.includes('1688.com')) return;

  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    func: pageInterceptorFn,
  }).catch(() => {});
});

// ── 툴바 클릭 → UI 탭 열기
// 이미 열려있으면 해당 탭으로 포커스, 없으면 새 탭 생성
chrome.action.onClicked.addListener(async (tab) => {
  const panelUrl = chrome.runtime.getURL('ui/index.html');
  const existing = await chrome.tabs.query({ url: panelUrl });
  if (existing.length > 0) {
    chrome.tabs.update(existing[0].id, { active: true });
    chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: panelUrl });
  }
});

// ── 메시지 허브: UI 탭 ↔ content script 중계 ─────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    // UI → 1688 탭에 스크래핑 요청
    case 'SCRAPE_REQUEST': {
      handleScrapeRequest(msg, sendResponse);
      return true; // async
    }

    // UI → 이미지 URL 목록 다운로드 요청
    case 'DOWNLOAD_IMAGES': {
      handleDownloadImages(msg.urls, msg.prefix, sendResponse);
      return true;
    }

    // content script → UI 탭: chrome.runtime.sendMessage가 extension 페이지에
    // 직접 전달되므로 SW에서 re-broadcast 불필요 (중복 수신 방지)
    case 'SCRAPE_LOG':
    case 'SCRAPE_DONE':
    case 'SCRAPE_ERROR':
    case 'REGISTER_LOG':
    case 'REGISTER_DONE':
    case 'REGISTER_ERROR':
      break; // no-op

    // content script → 자신의 탭 닫기 요청
    case 'CLOSE_TAB': {
      if (sender.tab?.id) chrome.tabs.remove(sender.tab.id);
      break;
    }

    // UI → 서플라이어 허브 탭 열기 + 자동 등록 시작
    case 'REGISTER_REQUEST': {
      handleRegisterRequest(msg, sendResponse);
      return true;
    }

    // UI → 서플라이어 허브 Draft API 임시저장 (CORS 우회용)
    case 'DRAFT_SAVE': {
      handleDraftSave(msg, sendResponse);
      return true;
    }

    // UI → 번역 요청 (Google Translate fetch는 UI에서 직접 가능,
    //     혹시 content script 컨텍스트에서 CORS가 필요할 때만 SW 경유)
    case 'TRANSLATE_REQUEST': {
      handleTranslate(msg.text, msg.reqId, sendResponse);
      return true;
    }

    // UI → 상품명 AI 정제 요청 (Gemini)
    case 'REFINE_PRODUCT_NAME': {
      handleRefineProductName(msg.name, sendResponse);
      return true;
    }
  }
});

// ── Gemini API 상품명 정제 ────────────────────────────────────────────────────
const GEMINI_API_KEY = 'AIzaSyASNebUbDTaO15i6bXp3NrzSFmAOs0uv58';

async function handleRefineProductName(name, sendResponse) {
  try {
    const prompt = `다음은 중국 쇼핑몰에서 수집된 상품명을 한국어로 번역한 것입니다. 한국의 쿠팡이나 네이버 스마트스토어에서 판매하기 좋은 깔끔하고 간결한 상품명으로 정제해주세요. 수식어, 도매/공장 관련 용어, 브랜드홍보 문구는 제거하고 핵심 상품명만 1줄로 출력하세요. 다른 설명 없이 정제된 상품명만 출력하세요.\n원본: ${name}`;
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await resp.json();
    const refined = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || name;
    sendResponse({ ok: true, refined });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

// ── 스크래핑 실행 ──────────────────────────────────────────────────────────────
async function handleScrapeRequest(msg, sendResponse) {
  try {
    const url = msg.url;

    // ── Plan A: background fetch (탭 없이) ────────────────────────────────────
    broadcastToUI({ type: 'SCRAPE_LOG', text: '⏳ [Plan A] background fetch 시도 중...' });
    const bgResult = await tryBackgroundFetch(url);
    if (bgResult) {
      broadcastToUI({ type: 'SCRAPE_LOG', text: `✅ [Plan A] 성공 — SKU ${bgResult.skus?.length || 0}개, 이미지 ${bgResult.images?.length || 0}장` });
      broadcastToUI({ type: 'SCRAPE_DONE', result: bgResult });
      sendResponse({ ok: true });
      return;
    }

    // ── Plan B: 탭 열기 + window.context ─────────────────────────────────────
    broadcastToUI({ type: 'SCRAPE_LOG', text: '⚠️ [Plan A] 실패 → 탭 방식으로 전환' });
    const tab = await findOrCreateTab(url, /1688\.com/);
    await waitForTabLoad(tab.id);

    let preloadedData = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: function() {
          var ctx = window.context;
          if (ctx && ctx.result && ctx.result.data && ctx.result.data.gallery &&
              ctx.result.data.gallery.fields && ctx.result.data.gallery.fields.subject) {
            try { return { src: 'context', data: JSON.parse(JSON.stringify(ctx)) }; }
            catch(e) {}
          }
          return { src: 'not-found' };
        },
      });
      if (results?.[0]?.result) preloadedData = results[0].result;
    } catch (e) {
      console.warn('[SW] executeScript 실패:', e.message);
    }

    // window.context 데이터 있으면 직접 처리 (탭 닫기)
    if (preloadedData?.src === 'context') {
      const result = mapContextData(preloadedData.data, null);
      if (result?.title_cn) {
        result.detail_images = await fetchDetailImages(result.detailUrl);
        result.scrape_method = 'WindowContext';
        result.sku_debug     = ['window-context'];
        result.attr_debug    = ['tab-no-html'];
        broadcastToUI({ type: 'SCRAPE_LOG', text: `✅ [Plan B] window.context 성공 — SKU ${result.skus?.length || 0}개` });
        broadcastToUI({ type: 'SCRAPE_DONE', result });
        chrome.tabs.remove(tab.id);
        sendResponse({ ok: true });
        return;
      }
    }

    // ── 최종 폴백: DOM 스크래핑 (content script) ──────────────────────────────
    broadcastToUI({ type: 'SCRAPE_LOG', text: '⚠️ window.context 없음 → DOM 스크래핑으로 전환' });
    chrome.tabs.sendMessage(tab.id, { type: 'START_SCRAPE', url, tabId: tab.id, preloadedData });
    sendResponse({ ok: true, tabId: tab.id });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

// ── 이미지 다운로드 (fetch + ArrayBuffer 반환) ─────────────────────────────────
async function handleDownloadImages(urls, prefix, sendResponse) {
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const resp = await fetch(url, {
        headers: {
          'Referer': 'https://detail.1688.com/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'image/jpeg,image/png,image/*;q=0.8',
        },
      });
      if (!resp.ok) { results.push(null); continue; }
      const buffer = await resp.arrayBuffer();
      if (buffer.byteLength < 5000) { results.push(null); continue; } // 너무 작은 파일 스킵

      // ArrayBuffer를 base64로 변환해서 전달 (IndexedDB 저장은 UI에서)
      const base64 = arrayBufferToBase64(buffer);
      results.push({ index: i, base64, url, prefix });
    } catch (e) {
      results.push(null);
    }
  }

  sendResponse({ ok: true, images: results });
}

// ── 서플라이어 허브 등록 ──────────────────────────────────────────────────────
async function handleRegisterRequest(msg, sendResponse) {
  try {
    const tab = await chrome.tabs.create({
      url: 'https://supplier.coupang.com/wing/products/registrations/v3/items/new',
      active: true,
    });

    // 탭 로드 후 content script에 데이터 전달
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.sendMessage(tab.id, {
          type: 'START_REGISTER',
          data: msg.data,
        });
      }
    });

    sendResponse({ ok: true, tabId: tab.id });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

// ── 서플라이어 허브 Draft API 임시저장 ───────────────────────────────────────
async function handleDraftSave(msg, sendResponse) {
  const {
    productName, categoryPath, categoryId, displayCategoryCode, productNoticeNumber,
    supplyPrice, salePrice, optionName, mainImgKey, labelImgKey, detailImgKey,
  } = msg;

  try {
    const cookies = await new Promise(resolve =>
      chrome.cookies.getAll({ domain: '.coupang.com' }, (list) => {
        const obj = {};
        (list || []).forEach(c => { obj[c.name] = c.value; });
        resolve(obj);
      })
    );
    if (!Object.keys(cookies).length) {
      sendResponse({ ok: false, error: '쿠팡 서플라이어 허브에 로그인해주세요' });
      return;
    }
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

    // 1. 초안 생성
    broadcastToUI({ type: 'DRAFT_LOG', text: '⏳ 초안 생성 중...' });
    const createPayload = {
      docId: null, productName, categoryId, categoryPath,
      displayCategoryCode, productNoticeNumber,
      scope: 'Retail_Categorized_Single', version: 160, remark: null,
      jsonDocument: [{ startPage: { productName, categoryPath } }],
    };
    const createResp = await fetch('https://supplier.coupang.com/sr/draft/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieStr },
      body: JSON.stringify(createPayload),
    });
    const createResult = await createResp.json();
    const docId = createResult.docId;
    if (!docId) {
      sendResponse({ ok: false, error: '초안 생성 실패: ' + JSON.stringify(createResult) });
      return;
    }
    broadcastToUI({ type: 'DRAFT_LOG', text: `✅ 초안 생성 완료 (docId: ${docId})` });

    // 2. 이미지 업로드 (IDB에서 직접 읽기)
    const uploadFromIdb = async (idbKey, imageType, filename, mimeType) => {
      const rec = await swIdbGet(idbKey);
      if (!rec) return null;
      const blob = new Blob([rec.buffer], { type: mimeType || rec.mimeType || 'image/png' });
      const form = new FormData();
      form.append('additionalImageFiles', blob, filename);
      const resp = await fetch(
        `https://supplier.coupang.com/sr/draft/api/upload-images/${docId}?imageType=${imageType}`,
        { method: 'POST', body: form, headers: { Cookie: cookieStr } }
      );
      const result = await resp.json();
      console.log(`[DRAFT upload ${imageType}]`, result);
      return result.imageFilename || result.filename || (Array.isArray(result) ? result[0] : null) || null;
    };

    let mainFilename = null, labelFilename = null, detailFilename = null;

    if (mainImgKey) {
      mainFilename = await uploadFromIdb(mainImgKey, 'MAIN', 'main.jpg', null);
      if (mainFilename) broadcastToUI({ type: 'DRAFT_LOG', text: '✅ 대표이미지 업로드 완료' });
    }

    labelFilename = await uploadFromIdb(labelImgKey, 'LABEL', 'label.png', 'image/png');
    if (labelFilename) broadcastToUI({ type: 'DRAFT_LOG', text: '✅ 라벨 이미지 업로드 완료' });
    else broadcastToUI({ type: 'DRAFT_LOG', text: '⚠️ 라벨 이미지 없음 — Step 3에서 먼저 생성해주세요' });

    detailFilename = await uploadFromIdb(detailImgKey, 'DETAIL', 'detail.png', 'image/png');
    if (detailFilename) broadcastToUI({ type: 'DRAFT_LOG', text: '✅ 상세페이지 이미지 업로드 완료' });
    else broadcastToUI({ type: 'DRAFT_LOG', text: '⚠️ 상세페이지 이미지 없음 — Step 3에서 먼저 생성해주세요' });

    // 3. 전체 jsonDocument 업데이트
    broadcastToUI({ type: 'DRAFT_LOG', text: '⏳ 정보 업데이트 중...' });
    const jsonDocument = [{
      startPage: { productName, categoryPath },
      productPage: {
        brand: '헤오르', businessType: '기타 도소매업자', manufacturer: '헤오르',
        taxationSchema: '과세', importType: '수입상품',
        coupangSalePrice: salePrice, purchasePrice: supplyPrice,
        productBarcode: '바코드 없음(쿠팡 바코드 생성 요청)',
        exposedAttributes: optionName ? [{ attributeName: '색상', attributeValue: optionName }] : [],
        unexposedAttributes: [], commonAttributes: {}, searchTags: '',
      },
      imagePage: {
        images: {
          mainImage: mainFilename || '', additionalImage: '',
          labelImages: labelFilename
            ? [{ labelImageType: '제품 한글 표시사항 라벨 또는 도안 이미지', labelImageFiles: labelFilename }]
            : [],
        },
        details: { detailedImage: detailFilename || '', htmlProductDetailContent: null, altText: productName },
        msrpAgree: true,
      },
      legalPage: {
        kcMarkType: '해당사항없음',
        certificates: [
          { certificateName: '전기용품 및 생활용품, 어린이 (KC) 인증번호', certificateValue: '해당사항없음' },
          { certificateName: '방송통신 기자재 (EMC) 인증 번호', certificateValue: '해당사항없음' },
          { certificateName: '안전기준적합확인 신고번호', certificateValue: '해당사항없음' },
          { certificateName: 'KCS 인증번호', certificateValue: '해당사항없음' },
        ],
        adCert: '',
        notices: [
          { noticeItemName: '품명 및 모델명', noticeItemValue: '컨텐츠 참조' },
          { noticeItemName: '인증/허가 사항', noticeItemValue: '컨텐츠 참조' },
          { noticeItemName: '제조국(원산지)', noticeItemValue: '컨텐츠 참조' },
          { noticeItemName: '제조자(수입자)', noticeItemValue: '컨텐츠 참조' },
          { noticeItemName: '소비자상담 관련 전화번호', noticeItemValue: '컨텐츠 참조' },
        ],
      },
      logisticsPage: {
        totalSKUsInBox: null, daysToExpiration: null,
        specialHandlingReason: '해당사항없음', skuUnitBoxWeight: '', skuUnitBoxDimension: '',
      },
      sourcingPage: { sourcingChannelType: '', sourcingChannelId: '' },
    }];

    const updatePayload = {
      docId, productName, categoryId, categoryPath,
      displayCategoryCode, productNoticeNumber,
      scope: 'Retail_Categorized_Single', version: 160, remark: null,
      jsonDocument,
    };
    const updateResp = await fetch('https://supplier.coupang.com/sr/draft/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieStr },
      body: JSON.stringify(updatePayload),
    });
    const updateResult = await updateResp.json();
    console.log('[DRAFT update]', updateResult);

    broadcastToUI({ type: 'DRAFT_LOG', text: '🎉 임시저장 완료! 서플라이어 허브 → "중간 저장 불러오기"에서 불러오세요.' });
    sendResponse({ ok: true, docId });
  } catch (e) {
    sendResponse({ ok: false, error: e.message });
  }
}

// ── SW에서 IDB 직접 읽기 (UI와 동일한 DB 공유) ───────────────────────────────
function swIdbGet(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('heaorImages', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const r = db.transaction('images', 'readonly').objectStore('images').get(key);
      r.onsuccess = (e) => resolve(e.target.result || null);
      r.onerror   = (e) => reject(e.target.error);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Google Translate (SW 경유 버전) ──────────────────────────────────────────
async function handleTranslate(text, reqId, sendResponse) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const translated = data[0].map(x => x[0]).join('');
    sendResponse({ ok: true, translated, reqId });
  } catch (e) {
    sendResponse({ ok: false, error: e.message, reqId });
  }
}

// ── 유틸: UI 탭에 브로드캐스트 ──────────────────────────────────────────────
function broadcastToUI(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // UI 탭이 닫혀있으면 무시
  });
}

// ── 유틸: 탭 찾기 또는 생성 ──────────────────────────────────────────────────
async function findOrCreateTab(url, domainRegex) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(t => t.url && domainRegex.test(t.url));
  if (existing) {
    await chrome.tabs.update(existing.id, { url, active: true });
    return existing;
  }
  return await chrome.tabs.create({ url, active: true });
}

// ── 유틸: 탭 로드 완료 대기 ──────────────────────────────────────────────────
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    // 이미 로드 완료 상태일 수도 있으므로 즉시 체크
    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });
}

// ── 페이지 인터셉터 함수 (MAIN world 주입용) ──────────────────────────────────
// chrome.tabs.onUpdated → executeScript({ world:'MAIN', func: pageInterceptorFn })
// 로 1688 페이지 로딩 시작 즉시 실행됨.
function pageInterceptorFn() {
  if (window.__1688_hooked__) return;
  window.__1688_hooked__ = true;

  function isProduct(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    return !!(v.subject || v.title || v.skuModel || v.skuPriceList || v.itemImages ||
      (v.offerDetail   && (v.offerDetail.subject   || v.offerDetail.skuModel))  ||
      (v.offerDetailVO && (v.offerDetailVO.subject  || v.offerDetailVO.skuModel)));
  }

  function postProduct(data, src) {
    window.postMessage({ __type: '__1688_product__', payload: data, url: src }, '*');
  }

  // 글로벌 변수 즉시 체크
  var GLOBALS = ['runParams', '__GLOBAL_DATA__', 'pageData', '_data_',
                 '__pageInfo__', 'detailData', '__INIT_DATA__', 'offerDetailModel'];
  for (var gi = 0; gi < GLOBALS.length; gi++) {
    var g = window[GLOBALS[gi]];
    var gd = g && (g.data || g);
    var inner = gd && (gd.offerDetail || gd.offerDetailVO || gd.model);
    if (isProduct(gd))    { postProduct(gd,    'global:'       + GLOBALS[gi]); return; }
    if (isProduct(inner)) { postProduct(inner, 'global-inner:' + GLOBALS[gi]); return; }
  }

  // fetch / XHR 후킹
  function probe(text, reqUrl) {
    if (!text || (text[0] !== '{' && text[0] !== '[')) return;
    try {
      var root = JSON.parse(text);
      console.log('[1688-intercept] API:', reqUrl.split('?')[0], '| top keys:', Object.keys(root).slice(0, 8));
      var cands = [root, root.data, root.result, root.pageData, root.content,
        root.data && root.data.offerDetail,
        root.data && root.data.offerDetailVO,
        root.data && root.data.model];
      for (var i = 0; i < cands.length; i++) {
        if (isProduct(cands[i])) {
          console.log('[1688-intercept] ✅ 상품 데이터 발견! URL:', reqUrl.split('?')[0], '| keys:', Object.keys(cands[i]).slice(0, 15));
          postProduct(cands[i], reqUrl); return;
        }
      }
    } catch(e) {}
  }

  var _fetch = window.fetch;
  window.fetch = function() {
    return _fetch.apply(this, arguments).then(function(resp) {
      resp.clone().text().then(function(t) { probe(t, resp.url); }).catch(function(){});
      return resp;
    });
  };

  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, u) {
    this.__u = String(u || '');
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() { probe(xhr.responseText || '', xhr.__u || ''); });
    return _send.apply(this, arguments);
  };
}

// ── 유틸: ArrayBuffer → Base64 ───────────────────────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── window.context 기반 스크래퍼 헬퍼 ────────────────────────────────────────

function extractWindowContext(html, debug = false) {
  // window.context= 또는 window.context = 만 찾기 (contextPath 등 제외)
  const assignRe = /window\.context\s*=/g;
  let match;
  let eqEndIdx = -1;
  while ((match = assignRe.exec(html)) !== null) {
    // = 바로 뒤 위치
    eqEndIdx = match.index + match[0].length;
    break;
  }
  if (eqEndIdx === -1) return null;

  // IIFE 패턴 감지: window.context = (function...
  const afterEq = html.slice(eqEndIdx, eqEndIdx + 20).trimStart();
  if (debug) broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] afterEq: "${afterEq.slice(0, 30)}"` });
  let dataStart;

  if (afterEq.startsWith('(function')) {
    // 함수 본문 { } 건너뛰고 실제 데이터 인자 { 찾기
    const funcBodyStart = html.indexOf('{', eqEndIdx);
    if (funcBodyStart === -1) return null;
    let depth = 0, inStr = false, strChar = '', escaped = false, funcBodyEnd = -1;
    for (let i = funcBodyStart; i < html.length; i++) {
      const c = html[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && inStr) { escaped = true; continue; }
      if (!inStr && (c === '"' || c === "'")) { inStr = true; strChar = c; continue; }
      if (inStr && c === strChar) { inStr = false; continue; }
      if (!inStr) {
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { funcBodyEnd = i; break; } }
      }
    }
    if (funcBodyEnd === -1) return null;
    const commaIdx = html.indexOf(',{', funcBodyEnd);
    if (commaIdx === -1) return null;
    dataStart = commaIdx + 1;
  } else {
    // 일반 할당: window.context = {...}
    dataStart = html.indexOf('{', eqEndIdx);
    if (dataStart === -1) return null;
  }

  if (debug) broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] context 원문 앞 200자: ${html.slice(dataStart, dataStart + 200).replace(/\n/g, ' ')}` });

  let depth = 0, inStr = false, strChar = '', escaped = false;
  for (let i = dataStart; i < dataStart + 3000000 && i < html.length; i++) {
    const c = html[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\' && inStr) { escaped = true; continue; }
    if (!inStr && (c === '"' || c === "'")) { inStr = true; strChar = c; continue; }
    if (inStr && c === strChar) { inStr = false; continue; }
    if (!inStr) {
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const raw = html.slice(dataStart, i + 1);
          const fixedRaw = raw.replace(/([{,])\s*(\d+)\s*:/g, '$1"$2":');
          try { return JSON.parse(fixedRaw); }
          catch(e) {
            if (debug) {
              const errPos = parseInt(e.message.match(/position (\d+)/)?.[1] || '0');
              broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] JSON 파싱 에러: ${e.message}, 길이: ${raw.length}자` });
              broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] 에러 위치 ±100자: ...${raw.slice(Math.max(0, errPos - 100), errPos + 100).replace(/\n/g, '↵')}...` });
              console.log('[Plan A] raw JSON 전체:', raw);
            }
            return null;
          }
        }
      }
    }
  }
  return null;
}

function parseAttributesFromHtml(html) {
  const attrs = [];
  const skip = new Set(['항목 번호.', '항목번호', '품목 번호', '품목번호', '색상', '상표', '브랜드', 'SKU', 'Item No.']);
  const re = /<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const key = m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    const val = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!key || !val || key.length > 25 || val.length > 200) continue;
    if (skip.has(key) || /^\d+$/.test(key)) continue;
    attrs.push({ name: key, value: val });
  }
  return attrs;
}

function htmlDecodeStr(str) {
  return str.replace(/&gt;/g, '>').replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function mapContextData(ctx, htmlText) {
  const data = ctx?.result?.data;
  if (!data) return null;
  const title = data.gallery?.fields?.subject;
  const dj = data.Root?.fields?.dataJson;
  if (!title || !dj) return null;

  const images = (dj.images || []).map(img => img.fullPathImageURI).filter(Boolean);

  const skuInfoMap = dj.skuModel?.skuInfoMap || {};
  const skuProps   = dj.skuModel?.skuProps   || [];

  const nameToImageUrl = {};
  for (const prop of skuProps) {
    for (const v of (prop.value || [])) {
      if (v.imageUrl && v.name) nameToImageUrl[v.name] = v.imageUrl;
    }
  }

  const skus = [];
  let priceMin = Infinity;
  for (const [rawKey, item] of Object.entries(skuInfoMap)) {
    const key   = htmlDecodeStr(rawKey);
    const name  = key.split('>')[0].trim();
    const price = parseFloat(item.discountPrice || item.price || 0);
    if (price > 0 && price < priceMin) priceMin = price;
    skus.push({ name, price, imageUrl: nameToImageUrl[name] || null, skuId: item.skuId });
  }
  if (priceMin === Infinity) priceMin = 0;

  const sku_groups = skuProps.map(prop => ({
    dimension: prop.prop,
    isColorDim: prop.value?.some(v => v.imageUrl),
    items: (prop.value || []).map(v => ({ name: v.name, imageUrl: v.imageUrl || null })),
  }));

  const attributes = htmlText ? parseAttributesFromHtml(htmlText) : [];
  const detailUrl  = data.description?.fields?.detailUrl || '';

  return { title_cn: title, price_min: priceMin, images, skus, sku_groups, attributes, detailUrl };
}

async function fetchDetailImages(detailUrl) {
  if (!detailUrl) return [];
  try {
    const resp = await fetch(detailUrl, {
      headers: { 'Referer': 'https://detail.1688.com/', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!resp.ok) return [];
    const html = await resp.text();
    const re = /<img[^>]+src=["']([^"']+)["']/gi;
    const imgs = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      let src = m[1];
      if (!src.includes('alicdn.com') && !src.includes('1688.com') && !src.includes('tmall.com')) continue;
      if (src.startsWith('//')) src = 'https:' + src;
      if (src.startsWith('http')) imgs.push(src);
    }
    return [...new Set(imgs)].slice(0, 20);
  } catch (e) {
    return [];
  }
}

async function tryBackgroundFetch(url) {
  try {
    const cookies = await new Promise(r => chrome.cookies.getAll({ domain: '.1688.com' }, r));
    broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] 쿠키 ${cookies?.length || 0}개` });
    if (!cookies?.length) return null;

    const resp = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.1688.com/',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-site',
      },
    });
    broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] fetch status: ${resp.status}, url: ${resp.url.slice(0, 80)}` });
    if (!resp.ok) return null;
    const html = await resp.text();
    broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] HTML ${html.length}자, window.context 포함: ${html.includes('window.context')}` });

    const ctx = extractWindowContext(html, true);
    broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] context 파싱: ${ctx ? '성공' : '실패'}, subject: ${ctx?.result?.data?.gallery?.fields?.subject?.slice(0, 30) || '없음'}` });
    if (!ctx?.result?.data?.gallery?.fields?.subject) return null;

    const result = mapContextData(ctx, html);
    if (!result?.title_cn) return null;

    result.detail_images = await fetchDetailImages(result.detailUrl);
    result.scrape_method = 'BackgroundFetch';
    result.sku_debug     = ['background-fetch'];
    result.attr_debug    = ['html-td-parse'];
    return result;
  } catch (e) {
    broadcastToUI({ type: 'SCRAPE_LOG', text: `[Plan A] 예외: ${e.message}` });
    console.warn('[SW] tryBackgroundFetch 실패:', e.message);
    return null;
  }
}
