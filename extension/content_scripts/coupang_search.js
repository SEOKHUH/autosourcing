/**
 * coupang_search.js — 쿠팡 검색/카테고리 페이지 소싱 도우미
 *
 * 카드 우상단 🔍 클릭
 *  → /next-api/review/batch  : categoryId 추출
 *  → /next-api/review (페이지네이션) : 30일 리뷰수 카운트 → × 10 = 월 예상 판매량
 *  → 오버레이 표시 → 소싱 큐 추가
 */

const LOOKUP_BTN_CLASS = 'heaor-lookup-btn';
const OVERLAY_CLASS    = 'heaor-overlay';

// ── 소싱 후보 배너 (쿠팡 페이지) ─────────────────────────────────────────────
const _bannerCandidates = [];
let _bannerEl = null;
let _bannerCollapsed = localStorage.getItem('heaor-banner-collapsed') === 'true';

function addToBanner(candidate) {
  _bannerCandidates.push(candidate);
  renderCoupangBanner();
}

function renderCoupangBanner() {
  // SPA 이동 시 DOM에서 분리된 경우 재생성 허용
  if (_bannerEl && !document.body.contains(_bannerEl)) _bannerEl = null;

  if (!_bannerCandidates.length) {
    _bannerEl?.remove();
    _bannerEl = null;
    return;
  }

  if (!_bannerEl) {
    _bannerEl = document.createElement('div');
    _bannerEl.id = 'heaor-coupang-banner';
    _bannerEl.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#fff', 'padding:8px 16px',
      'display:flex', 'align-items:center', 'gap:12px',
      'font-family:sans-serif',
      'border-bottom:1.5px solid #e2e4e9', 'box-shadow:0 2px 8px rgba(0,0,0,0.08)',
    ].join(';');
    document.body.insertBefore(_bannerEl, document.body.firstChild);
  }

  _bannerEl.innerHTML = '';

  // ── 헤더 (항상 표시) ──
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = _bannerCollapsed ? '▾' : '▴';
  toggleBtn.style.cssText = 'background:none;border:none;color:#aaa;font-size:14px;cursor:pointer;padding:0;line-height:1;flex-shrink:0;';
  toggleBtn.addEventListener('click', () => {
    _bannerCollapsed = !_bannerCollapsed;
    localStorage.setItem('heaor-banner-collapsed', _bannerCollapsed);
    renderCoupangBanner();
  });
  header.appendChild(toggleBtn);

  const label = document.createElement('span');
  label.textContent = '소싱 후보';
  label.style.cssText = 'white-space:nowrap;color:#888;font-size:12px;font-weight:600;';
  header.appendChild(label);

  const countBadge = document.createElement('span');
  countBadge.textContent = `${_bannerCandidates.length}개`;
  countBadge.style.cssText = 'color:#0ea5e9;font-weight:700;font-size:12px;white-space:nowrap;';
  header.appendChild(countBadge);

  _bannerEl.appendChild(header);

  if (_bannerCollapsed) return;

  // ── 펼침 상태: 카드 슬라이더 + 우측 버튼 ──
  const slider = document.createElement('div');
  slider.style.cssText = 'display:flex;gap:8px;overflow-x:auto;flex:1;scrollbar-width:none;padding:2px 0;align-items:flex-start;';
  _bannerCandidates.forEach((c, i) => {
    const card = document.createElement('div');
    card.style.cssText = [
      'display:flex', 'flex-direction:column',
      'width:82px', 'flex-shrink:0',
      'border-radius:8px', 'overflow:hidden',
      'border:1.5px solid #e2e4e9', 'background:#f4f6fb',
      'position:relative', 'cursor:pointer',
    ].join(';');

    const thumb = document.createElement('img');
    thumb.src = c.thumbnailUrl || '';
    thumb.referrerPolicy = 'no-referrer';
    thumb.className = 'heaor-banner-thumb';
    thumb.style.cssText = 'background:#e8eaee;';
    card.appendChild(thumb);

    const name = document.createElement('span');
    name.textContent = c.productName || '상품명 없음';
    name.style.cssText = [
      'font-size:10px', 'line-height:1.35', 'color:#333',
      'padding:4px 6px 5px',
      'display:-webkit-box', '-webkit-line-clamp:2',
      '-webkit-box-orient:vertical', 'overflow:hidden',
    ].join(';');
    card.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.style.cssText = [
      'position:absolute', 'top:3px', 'right:3px',
      'background:rgba(0,0,0,0.45)', 'border:none', 'color:#fff',
      'font-size:9px', 'cursor:pointer', 'padding:1px 4px',
      'border-radius:4px', 'line-height:1.4',
    ].join(';');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _bannerCandidates.splice(i, 1);
      chrome.runtime.sendMessage({ type: 'REMOVE_SOURCING_CANDIDATE', candidateId: c.id });
      renderCoupangBanner();
    });
    card.appendChild(removeBtn);

    card.addEventListener('click', (e) => {
      if (e.target === removeBtn) return;
      if (c.coupangUrl) window.open(c.coupangUrl, '_blank');
    });

    slider.appendChild(card);
  });
  _bannerEl.appendChild(slider);

  const closeAll = document.createElement('button');
  closeAll.textContent = '전체 삭제';
  closeAll.style.cssText = 'background:none;border:none;color:#aaa;font-size:10px;cursor:pointer;padding:0;white-space:nowrap;flex-shrink:0;align-self:center;';
  closeAll.addEventListener('click', () => {
    const ids = _bannerCandidates.map(c => c.id);
    _bannerCandidates.length = 0;
    ids.forEach(id => chrome.runtime.sendMessage({ type: 'REMOVE_SOURCING_CANDIDATE', candidateId: id }));
    renderCoupangBanner();
  });
  _bannerEl.appendChild(closeAll);
}

// ── CSS 주입 (1회) ─────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('heaor-styles')) return;
  const style = document.createElement('style');
  style.id = 'heaor-styles';
  style.textContent = `
    .${LOOKUP_BTN_CLASS} {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 30px; height: 30px;
      border-radius: 50%;
      background: rgba(255,255,255,0.88);
      border: none;
      cursor: pointer;
      font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      opacity: 0;
      z-index: 2000;
      transition: opacity 0.2s;
      padding: 0; line-height: 1;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    }
    .heaor-card-wrap:hover .${LOOKUP_BTN_CLASS} { opacity: 1; }
    .${LOOKUP_BTN_CLASS}:hover { opacity: 1; }

    .${OVERLAY_CLASS} {
      position: absolute; inset: 4px;
      background: rgba(0,0,0,0.82);
      border-radius: 16px;
      z-index: 2001;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 12px;
      color: #fff;
      font-family: 'Noto Sans KR', sans-serif;
      box-sizing: border-box;
    }
    .heaor-banner-thumb { width:82px !important; height:82px !important; object-fit:contain !important; display:block !important; flex-shrink:0 !important; }
    .heaor-loading { font-size: 12px; color: #ccc; text-align: center; }
    .heaor-data { width: 100%; display: flex; flex-direction: column; gap: 6px; }
    .heaor-row { font-size: 11px; color: #bbb; line-height: 1.5; }
    .heaor-row strong { color: #fff; font-size: 13px; }
    .heaor-row-error { font-size: 11px; color: #f87171; }
    .heaor-btns { display: flex; gap: 6px; margin-top: 10px; width: 100%; }
    .heaor-btn-add {
      flex: 1; background: #e94560; color: #fff;
      border: none; border-radius: 6px;
      padding: 7px 0; font-size: 12px; font-weight: 700; cursor: pointer;
    }
    .heaor-btn-add:disabled { background: #28a745; cursor: default; }
    .heaor-btn-close {
      background: rgba(255,255,255,0.15); color: #fff;
      border: none; border-radius: 6px;
      padding: 7px 10px; font-size: 13px; cursor: pointer;
    }
    .heaor-btn-close:hover { background: rgba(255,255,255,0.28); }
  `;
  document.head.appendChild(style);
}

// ── categoryId 추출 (batch API) ────────────────────────────────────────────────
async function fetchCategoryId(productId) {
  try {
    const resp = await fetch(`/next-api/review/batch?productId=${productId}&viRoleCode=3`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const id = data?.reviewable?.contents?.categoryId;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

// ── 최근 30일 리뷰수 카운트 (페이지네이션) ────────────────────────────────────
async function countRecent30DaysReviews(productId) {
  let count = 0;
  let page = 1;
  const maxPages = 33; // 30개 × 33페이지 = 990개 상한 (IP 차단 방지)
  const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000);

  while (page <= maxPages) {
    try {
      const url = `/next-api/review?productId=${productId}&page=${page}&size=30&sortBy=DATE_DESC&viRoleCode=3&ratingSummary=true&ratings=&market=`;
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) break;
      const data = await resp.json();
      const reviews = data?.rData?.paging?.contents;
      if (!reviews || reviews.length === 0) break;

      let foundOlder = false;
      for (const review of reviews) {
        if (review.createdAt >= cutoffTime) {
          count++;
        } else {
          // 최신순 정렬이므로 30일 이전 리뷰 발견 시 이후는 전부 해당 없음
          foundOlder = true;
          break;
        }
      }
      if (foundOlder || data.rData.paging.isNext === false) break;

      page++;
    } catch {
      break;
    }
  }

  return { count, isMaxReached: page > maxPages };
}

// ── 카드에서 기본 데이터 추출 ──────────────────────────────────────────────────
function extractCardData(card) {
  const linkEl = card.querySelector('a[href*="/vp/products/"]')
               || card.querySelector('a[href*="itemId"]')
               || card.querySelector('a');
  const href = linkEl?.href || '';

  let productId = null;
  const pidMatch = href.match(/\/vp\/products\/(\d+)/) || href.match(/[?&]itemId=(\d+)/);
  if (pidMatch) productId = pidMatch[1];

  const nameSelectors = [
    '[class*="ProductUnit_productNameV2"]',
    '[class*="productName"]', '[class*="product-name"]', '[class*="ProductName"]',
    'dt', 'h3',
  ];
  let name = '';
  for (const sel of nameSelectors) {
    const el = card.querySelector(sel);
    if (el?.textContent?.trim()) { name = el.textContent.trim(); break; }
  }

  const priceSelectors = [
    '[class*="ProductUnit_price"]', '[class*="price-value"]',
    '[class*="priceValue"]', '[class*="price"]',
  ];
  let price = 0;
  for (const sel of priceSelectors) {
    const el = card.querySelector(sel);
    if (el) {
      const m = el.textContent.match(/(\d[\d,]*)/);
      price = m ? parseInt(m[1].replace(/,/g, '')) : 0;
      if (price > 0) break;
    }
  }

  const imgEl = card.querySelector('img.fw-aspect-square')
              || card.querySelector('img.fw-object-contain')
              || card.querySelector('img');
  // currentSrc: 실제 로드된 URL (lazy load 미완료 시 빈 문자열, .src 프로퍼티와 달리 페이지 URL 반환 안 함)
  let thumbnailUrl = imgEl?.currentSrc
                  || imgEl?.getAttribute('data-src')
                  || imgEl?.getAttribute('data-lazy')
                  || '';
  if (thumbnailUrl.startsWith('//')) thumbnailUrl = 'https:' + thumbnailUrl;

  const cleanUrl = productId
    ? `https://www.coupang.com/vp/products/${productId}`
    : href.split('?')[0];

  return { productId, name, price, thumbnailUrl, href: cleanUrl };
}

// ── 카드 오버레이 표시 ────────────────────────────────────────────────────────
function showOverlay(card, cardData) {
  card.querySelector('.' + OVERLAY_CLASS)?.remove();

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;

  const loading = document.createElement('div');
  loading.className = 'heaor-loading';
  loading.textContent = '⏳ 조회 중...';
  overlay.appendChild(loading);
  card.appendChild(overlay);

  // categoryId와 30일 리뷰수를 병렬로 조회
  Promise.all([
    fetchCategoryId(cardData.productId),
    countRecent30DaysReviews(cardData.productId),
  ]).then(([categoryId, reviewResult]) => {
    loading.remove();

    const dataDiv = document.createElement('div');
    dataDiv.className = 'heaor-data';

    // 카테고리 ID
    const catRow = document.createElement('div');
    if (categoryId) {
      catRow.className = 'heaor-row';
      catRow.innerHTML = `카테고리 ID<br><strong>${categoryId}</strong>`;
    } else {
      catRow.className = 'heaor-row-error';
      catRow.textContent = '카테고리 ID를 찾지 못했습니다';
    }
    dataDiv.appendChild(catRow);

    // 월 예상 판매량 (30일 리뷰수 × 10)
    const salesRow = document.createElement('div');
    salesRow.className = 'heaor-row';
    const { count, isMaxReached } = reviewResult;
    const estimated = (count * 10).toLocaleString();
    salesRow.innerHTML = `월 예상 판매량<br><strong>${estimated}개${isMaxReached ? ' (10,000+)' : ''}</strong>`;
    dataDiv.appendChild(salesRow);

    // 버튼
    const btns = document.createElement('div');
    btns.className = 'heaor-btns';

    const addBtn = document.createElement('button');
    addBtn.className = 'heaor-btn-add';
    addBtn.textContent = '+ 소싱 추가';
    addBtn.addEventListener('click', () => {
      const candidate = {
        id: 'cand_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        productName: cardData.name,
        price: cardData.price,
        thumbnailUrl: extractCardData(card).thumbnailUrl || cardData.thumbnailUrl,
        categoryId: categoryId || null,
        productId: cardData.productId,
        coupangUrl: cardData.href,
        estimatedMonthlySales: count * 10,
        status: 'pending',
        addedAt: Date.now(),
      };
      chrome.runtime.sendMessage({ type: 'ADD_SOURCING_CANDIDATE', data: candidate }, (r) => {
        if (r?.ok) {
          addBtn.textContent = '✓ 추가됨';
          addBtn.disabled = true;
          addToBanner(candidate);
          setTimeout(() => overlay.remove(), 800);
        }
      });
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'heaor-btn-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());

    btns.appendChild(addBtn);
    btns.appendChild(closeBtn);
    dataDiv.appendChild(btns);
    overlay.appendChild(dataDiv);
  });
}

// ── 썸네일 컨테이너 찾기 ─────────────────────────────────────────────────────
function findImgContainer(card) {
  const selectors = [
    '[class*="ProductUnit_img"]',
    '[class*="productImg"]',
    '[class*="product-img"]',
    '[class*="thumbnail"]',
    '[class*="imgWrap"]',
    '[class*="img-wrap"]',
  ];
  for (const sel of selectors) {
    const el = card.querySelector(sel);
    if (el) return el;
  }
  // 폴백: img 태그의 부모
  return card.querySelector('img')?.parentElement || card;
}

// ── 🔍 아이콘 부착 ───────────────────────────────────────────────────────────
function attachButton(card) {
  if (card.querySelector('.' + LOOKUP_BTN_CLASS)) return;

  const cardData = extractCardData(card);
  if (!cardData.href) return;

  card.classList.add('heaor-card-wrap');

  const btn = document.createElement('button');
  btn.className = LOOKUP_BTN_CLASS;
  btn.textContent = '🔍';
  btn.title = '소싱 데이터 조회';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showOverlay(card, cardData);
  });

  // 버튼을 <a> 밖 card(li)에 직접 붙여서 링크 클릭 전파 차단
  if (window.getComputedStyle(card).position === 'static') card.style.position = 'relative';
  card.appendChild(btn);

  // figure 중앙 기준으로 버튼 위치 계산
  requestAnimationFrame(() => {
    const figure = card.querySelector('[class*="ProductUnit_productImage"]');
    if (!figure) return;
    const cardRect = card.getBoundingClientRect();
    const figRect  = figure.getBoundingClientRect();
    btn.style.top       = (figRect.top  - cardRect.top  + figRect.height / 2 - 15) + 'px';
    btn.style.left      = (figRect.left - cardRect.left + figRect.width  / 2 - 15) + 'px';
    btn.style.transform = 'none';
  });
}

// ── 카드 셀렉터 ───────────────────────────────────────────────────────────────
const CARD_SELECTORS = [
  '[class*="ProductUnit_productUnit"]',
  'li[id^="productId"]',
  '.search-product-wrap',
  '.baby-product',
  '[class*="ProductCard"]',
  '[class*="product-card"]',
];

function findCards() {
  for (const sel of CARD_SELECTORS) {
    const cards = Array.from(document.querySelectorAll(sel));
    if (cards.length > 0) return cards;
  }
  return [];
}

function attachAll() {
  findCards().forEach(card => attachButton(card));
}

// ── MutationObserver: 동적 카드 대응 ─────────────────────────────────────────
const mutObs = new MutationObserver(() => {
  attachAll();
  // 배너가 DOM에서 사라진 경우(SPA 이동 등) 자동 복원
  if (_bannerCandidates.length && (!_bannerEl || !document.body.contains(_bannerEl))) {
    _bannerEl = null;
    renderCoupangBanner();
  }
});
mutObs.observe(document.body, { childList: true, subtree: true });

injectStyles();
attachAll();

// 페이지 로드/이동 시 pending 후보 복원 → 배너 재표시 (중복 방지)
chrome.runtime.sendMessage({ type: 'GET_PENDING_CANDIDATES' }, (candidates) => {
  if (!candidates?.length) return;
  candidates.forEach(c => {
    if (!_bannerCandidates.some(b => b.id === c.id)) _bannerCandidates.push(c);
  });
  renderCoupangBanner();
});
