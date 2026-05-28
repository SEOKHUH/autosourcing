/**
 * scraper_1688.js — 1688 상품 페이지 DOM 스크래퍼 (최적화 버전)
 *
 * 복잡한 JSON 가로채기(Interceptor)를 제거하고, 오직 화면(DOM)에 
 * 렌더링된 요소들을 기반으로 가장 직관적이고 가볍게 데이터를 긁어옵니다.
 */

// ── 소싱 후보 배너: 1688 페이지 진입 시 pending 후보 카드 슬라이더 UI ─────────
(function showCandidateBanner() {
  if (!document.getElementById('heaor-1688-styles')) {
    const s = document.createElement('style');
    s.id = 'heaor-1688-styles';
    s.textContent = '.heaor-banner-thumb{width:82px!important;height:82px!important;object-fit:contain!important;display:block!important;flex-shrink:0!important;}';
    document.head.appendChild(s);
  }

  chrome.runtime.sendMessage({ type: 'GET_PENDING_CANDIDATES' }, (candidates) => {
    if (!candidates?.length) return;

    const banner = document.createElement('div');
    banner.id = 'heaor-source-banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
      'background:#fff', 'padding:10px 16px',
      'display:flex', 'align-items:center', 'gap:12px',
      'font-family:sans-serif',
      'border-bottom:1.5px solid #e2e4e9', 'box-shadow:0 2px 8px rgba(0,0,0,0.08)',
    ].join(';');

    // 라벨
    const label = document.createElement('span');
    label.textContent = '소싱할 상품:';
    label.style.cssText = 'white-space:nowrap;color:#888;font-size:12px;font-weight:600;flex-shrink:0;align-self:center;';
    banner.appendChild(label);

    // 카드 슬라이더 컨테이너
    const slider = document.createElement('div');
    slider.style.cssText = [
      'display:flex', 'gap:8px', 'overflow-x:auto', 'flex:1',
      'scrollbar-width:none', 'padding:2px 0', 'align-items:flex-start',
    ].join(';');
    slider.style.msOverflowStyle = 'none';

    let selectedId = candidates[0].id;

    candidates.forEach((c, i) => {
      const card = document.createElement('div');
      card.dataset.id = c.id;
      card.style.cssText = [
        'display:flex', 'flex-direction:column',
        'width:82px', 'flex-shrink:0',
        'border-radius:8px', 'overflow:hidden', 'cursor:pointer',
        'border:1.5px solid ' + (i === 0 ? '#0ea5e9' : '#e2e4e9'),
        'background:' + (i === 0 ? 'rgba(14,165,233,0.08)' : '#f4f6fb'),
        'transition:border-color 0.15s,background 0.15s',
      ].join(';');

      // 썸네일
      const thumb = document.createElement('img');
      thumb.src = c.thumbnailUrl || '';
      thumb.referrerPolicy = 'no-referrer';
      thumb.className = 'heaor-banner-thumb';
      thumb.style.cssText = 'background:#e8eaee;';
      card.appendChild(thumb);

      // 상품명
      const name = document.createElement('span');
      name.textContent = c.productName || '(이름 없음)';
      name.style.cssText = [
        'font-size:10px', 'line-height:1.35', 'color:#333',
        'padding:4px 6px 5px',
        'display:-webkit-box', '-webkit-line-clamp:2',
        '-webkit-box-orient:vertical', 'overflow:hidden',
      ].join(';');
      card.appendChild(name);

      card.addEventListener('click', () => {
        slider.querySelectorAll('[data-id]').forEach(el => {
          el.style.borderColor = '#e2e4e9';
          el.style.background = '#f4f6fb';
        });
        card.style.borderColor = '#0ea5e9';
        card.style.background = 'rgba(14,165,233,0.08)';
        selectedId = c.id;
      });

      slider.appendChild(card);
    });

    banner.appendChild(slider);

    // 우측 영역: URL 연결 버튼 + 닫기
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;align-self:center;';

    // URL 연결 버튼
    const btn = document.createElement('button');
    btn.textContent = 'URL 연결 →';
    btn.style.cssText = [
      'background:#0ea5e9', 'color:#fff', 'border:none', 'border-radius:6px',
      'padding:7px 14px', 'font-size:12px', 'font-weight:700', 'cursor:pointer',
      'white-space:nowrap',
    ].join(';');
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'LINK_1688_TO_CANDIDATE',
        candidateId: selectedId,
        url: location.href,
      }, (resp) => {
        if (resp?.ok) {
          btn.textContent = '✓ 연결됨';
          btn.disabled = true;
          btn.style.background = '#16a34a';
          setTimeout(() => banner.remove(), 1500);
        }
      });
    });
    right.appendChild(btn);

    // 닫기 버튼
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.cssText = 'background:none;border:none;color:#aaa;font-size:10px;cursor:pointer;padding:0;white-space:nowrap;';
    closeBtn.addEventListener('click', () => banner.remove());
    right.appendChild(closeBtn);

    banner.appendChild(right);

    document.body.insertBefore(banner, document.body.firstChild);
  });
})();

// ── 상세 이미지 트리거를 위한 부드러운 스크롤 ───────────────────
async function scrollToBottom() {
  return new Promise(resolve => {
    let pos = 0;
    const step = () => {
      pos += window.innerHeight * 0.8;
      window.scrollTo(0, pos);
      if (pos < document.body.scrollHeight) {
        setTimeout(step, 80);
      } else {
        setTimeout(resolve, 800); // 최종 렌더링 대기
      }
    };
    step();
  });
}

// ── 가격 문자열 파서 ──────────────────────────────────────────
function parsePrice(text) {
  if (!text) return 0;
  const match = text.replace(/,/g, '').match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

// ── DOM 기반 데이터 스크래핑 코어 로직 ──────────────────────────────────────
function scrapeFromDOM(log) {
  const R = {
    title: '',
    price_min: 0,
    images: [],
    skus: [],
    attributes: [],
    method: 'Pure-DOM',
    sku_debug: [],
    attr_debug: [],
  };

  try {
    // 1. 상품명 추출 (Title)
    const titleSels = [
      'h1.title-text', '.title-text', '.product-title', '.offer-title',
      '.mod-main-title h1', '[class*="offerTitle"]', '[class*="title-text"]'
    ];
    
    // DOM에서 우선 탐색
    for (const sel of titleSels) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 3) {
        R.title = el.textContent.trim();
        break;
      }
    }
    
    // 폴백 1: document.title에서 가져오기 (가장 확실함)
    if (!R.title) {
      // 1688의 문서 제목은 "상품명 - 파자마/블라우스 등 - 알리바바" 형태로 되어있음
      const parts = document.title.split('-');
      if (parts.length >= 1 && parts[0].trim().length > 5 && !parts[0].includes('阿里巴巴')) {
        R.title = parts[0].trim();
      }
    }

    // 폴백 2: 화면에서 가장 긴 H1 찾기
    if (!R.title) {
      const h1s = Array.from(document.querySelectorAll('h1'));
      h1s.sort((a, b) => b.textContent.trim().length - a.textContent.trim().length);
      if (h1s[0]) R.title = h1s[0].textContent.trim();
    }

    // 2. 대표 가격 추출 (Price)
    const priceSels = [
      '[class*="price-text"]', '[class*="price-value"]', '[class*="price-num"]',
      '[class*="priceText"]', '[class*="offer-price"] em', '.price-original',
      '[class*="realPrice"]', '[class*="sale-price"]'
    ];
    let priceCandidates = [];
    for (const sel of priceSels) {
      const el = document.querySelector(sel);
      if (el) {
        const p = parsePrice(el.textContent);
        if (p > 0) priceCandidates.push(p);
      }
    }
    // 폴백: 전체 화면에서 ¥ 나 ￥ 주변 숫자 찾기
    if (priceCandidates.length === 0) {
      for (const el of document.querySelectorAll('span, div, em, p')) {
        if (el.children.length > 0) continue;
        const txt = el.textContent.trim();
        if ((txt.includes('¥') || txt.includes('￥')) && txt.length < 20) {
          const p = parsePrice(txt);
          if (p > 0) priceCandidates.push(p);
        }
      }
    }
    if (priceCandidates.length > 0) {
      // 가장 낮은 가격 선택
      R.price_min = Math.min(...priceCandidates);
    }

    // 3. 메인 이미지 추출 (Main Images)
    const imgSels = [
      '[class*="slider"] img', '[class*="gallery"] img',
      '.imgs-list li img', '[class*="image-list"] img',
      '[class*="mainPic"] img'
    ];
    const imgSet = new Set();
    for (const sel of imgSels) {
      const els = document.querySelectorAll(sel);
      els.forEach(el => {
        let u = el.src || el.getAttribute('data-src') || el.getAttribute('data-lazyload') || '';
        if (u.startsWith('//')) u = 'https:' + u;
        if (u.startsWith('http') && !u.includes('loading') && !u.includes('.gif')) {
          // 작은 썸네일 해상도를 원본으로 교체 시도 (URL 파싱 기반)
          u = u.replace(/\.(50x50|60x60|400x400|200x200)\.jpg/i, '.jpg');
          imgSet.add(u);
        }
      });
      if (imgSet.size >= 2) break; // 충분히 찾음
    }
    // R.images = Array.from(imgSet); -> SKU 추출 이후로 이동

    // 4. SKU(옵션) 추출 로직
    // ─ 핵심 원칙: SKU 옵션은 항상 "같은 부모 안에 여러 개가 모여 있다"
    // ─ 페이지 전체 셀렉터 금지 → 반드시 그룹핑 후 최적 그룹 선택

    // imgUrl 추출 헬퍼: lazy-load data-src 우선 + 1688 썸네일 suffix 제거
    function pickImgUrl(imgEl) {
      if (!imgEl) return '';
      const raw = imgEl.getAttribute('data-src')
               || imgEl.getAttribute('data-lazyload')
               || imgEl.getAttribute('data-original')
               || imgEl.getAttribute('data-lazy-src')
               || (() => {
                    const s = imgEl.src || '';
                    return (!s || s.startsWith('data:') || s.includes('loading')) ? '' : s;
                  })();
      if (!raw) return '';
      let url = raw.startsWith('//') ? 'https:' + raw : raw;
      // 1688 썸네일 suffix 제거 (항상 .jpg 확장자 보장)
      // 패턴 A: filename.jpg_sum.jpg  →  filename.jpg
      url = url.replace(/\.jpg_sum\.jpg$/i, '.jpg');
      // 패턴 A2: filename_sum.jpg (앞에 .jpg 없는 경우)  →  filename.jpg
      url = url.replace(/_sum\.jpg$/i, '.jpg');
      // 패턴 B: filename.jpg_80x80.jpg  →  filename.jpg
      url = url.replace(/\.jpg_\d+x\d+\.jpg$/i, '.jpg');
      // 패턴 B2: filename_80x80.jpg  →  filename.jpg
      url = url.replace(/_\d+x\d+\.jpg$/i, '.jpg');
      // 패턴 C: filename.50x50.jpg  /  filename_80x80.jpg (해상도가 dot-separated)
      url = url.replace(/\.(50x50|60x60|80x80|100x100|150x150|200x200)\.jpg$/i, '.jpg');
      url = url.replace(/_(50x50|60x60|80x80|100x100|150x150|200x200)\.jpg$/i, '.jpg');
      return url;
    }

    function extractSkuFromEl(el) {
      const imgEl = el.querySelector('img');
      const imgUrl = pickImgUrl(imgEl);
      let name = el.getAttribute('title')
              || el.getAttribute('data-value')
              || el.getAttribute('aria-label')
              || '';
      if (!name) {
        // 특정 레이블 클래스 우선 — span/div 전체 탐색은 아이콘 오탐 위험
        const labelEl = el.querySelector('.item-label, [class*="item-label"], [class*="value-name"], [class*="sku-name"]');
        if (labelEl) {
          name = labelEl.getAttribute('title') || labelEl.textContent;
        } else {
          // 가격 텍스트(¥X.X) 제거 후 요소 전체 텍스트 사용
          name = el.textContent.replace(/¥[\d.,]+/g, '');
        }
      }
      name = name.replace(/\s+/g, ' ').trim();
      // 단일 ASCII 문자는 UI 아이콘 오탐(예: 체크마크 "v") → 제외
      if (!name || name.length > 50 || /^[a-zA-Z0-9]$/.test(name)) return null;

      let price = 0;
      const dp = el.getAttribute('data-price') || el.getAttribute('data-originprice') || '';
      if (dp) price = parseFloat(dp) || 0;
      if (!price) {
        // item-price-stock 우선 (DevTools 확인: ¥5.5 표시)
        const pe = el.querySelector('.item-price-stock, [class*="item-price-stock"], [class*="price"]');
        if (pe) price = parsePrice(pe.textContent);
      }
      return { name, price, imageUrl: imgUrl };
    }

    // 그룹에서 스쿠 추출 후 skuMap 에 병합
    function mergeGroup(group, debugTag) {
      const tempMap = new Map();
      for (const el of group) {
        const sku = extractSkuFromEl(el);
        if (!sku) continue;
        if (!tempMap.has(sku.name) || (sku.imageUrl && !tempMap.get(sku.name).imageUrl)) {
          tempMap.set(sku.name, sku);
        }
      }
      if (tempMap.size >= 2) {
        for (const [n, s] of tempMap) {
          skuMap.set(n, s);
          if (s.imageUrl) imgSet.add(s.imageUrl);
        }
        R.sku_debug.push(`${debugTag}:${tempMap.size}`);
        return true;
      }
      return false;
    }

    const skuMap = new Map();

    // ── 전략 1a: expand-view-item 직접 탐색 (신형 1688, DevTools 확인된 구조) ──
    // 실제 구조: div.expand-view-item > img.ant-image-img + span.item-label + span.item-price-stock
    {
      const expandItems = document.querySelectorAll('[class*="expand-view-item"]');
      if (expandItems.length >= 2) {
        const group = Array.from(expandItems);
        mergeGroup(group, 'sku-expand-view-item');
      }
    }

    // ── 전략 1b: sku-filter-button 탐색 (신형 1688 색상 버튼 구조) ─────────────
    // 실제 구조: button.sku-filter-button > span.label-name
    if (skuMap.size < 2) {
      const btnGroups = new Map(); // 부모 컨테이너 → [버튼 목록]
      document.querySelectorAll('.sku-filter-button, [class*="sku-filter-button"]').forEach(btn => {
        const nameEl = btn.querySelector('.label-name, [class*="label-name"]');
        const name = nameEl ? nameEl.textContent.trim() : btn.textContent.trim();
        if (!name || name.length > 40) return;
        const parent = btn.parentElement;
        if (!parent) return;
        if (!btnGroups.has(parent)) btnGroups.set(parent, []);
        btnGroups.get(parent).push({ el: btn, name });
      });
      let bestBtnGroup = [];
      for (const [, group] of btnGroups) {
        if (group.length >= 2 && group.length > bestBtnGroup.length) bestBtnGroup = group;
      }
      if (bestBtnGroup.length >= 2) {
        for (const { name } of bestBtnGroup) {
          if (!skuMap.has(name)) skuMap.set(name, { name, price: 0, imageUrl: '' });
        }
        R.sku_debug.push(`sku-filter-button:${bestBtnGroup.length}`);
      }
    }

    // ── 전략 2: li[title] 그룹핑 (구형 1688 / 타오바오 구조) ─────────────────
    if (skuMap.size < 2) {
      const liGroups = new Map(); // 부모 → [li 목록]
      document.querySelectorAll('li[title]').forEach(li => {
        const t = (li.getAttribute('title') || '').trim();
        if (!t || t.length > 40) return;
        const p = li.parentElement;
        if (!p) return;
        if (!liGroups.has(p)) liGroups.set(p, []);
        liGroups.get(p).push(li);
      });
      let bestGroup = [];
      for (const [, group] of liGroups) {
        if (group.length >= 2 && group.length <= 25 && group.length > bestGroup.length)
          bestGroup = group;
      }
      if (bestGroup.length) mergeGroup(bestGroup, 'sku-li-title');
    }

    // ── 전략 3: SKU 컨테이너 찾고 그 안의 아이템 탐색 ────────────────────────
    if (skuMap.size < 2) {
      const containerSels = [
        '#skuSelection',                            // 신형 1688 (DevTools 확인)
        '[data-module*="sku_selection"]',
        '[class*="expand-view-list"]',
        '.obj-sku', '[class*="sku-prop"]', '[class*="skuProp"]',
        '[class*="sku-wrap"]', '[class*="sku-selector"]', '[class*="SkuSelector"]',
        '[class*="choose-attr"]', '[class*="product-sku"]',
        '[class*="sku-list"]', '.J_Prop', '[class*="mod-sku"]',
      ];
      let container = null;
      for (const sel of containerSels) {
        container = document.querySelector(sel);
        if (container) break;
      }
      if (container) {
        const itemSels = [
          '[class*="expand-view-item"]',
          'li', '[class*="sku-item"]', '[class*="skuItem"]',
          '[class*="prop-item"]', '[class*="attr-item"]',
        ];
        for (const sel of itemSels) {
          const els = Array.from(container.querySelectorAll(sel))
                           .filter(el => el.children.length > 0);
          if (els.length >= 2 && els.length <= 30) {
            if (mergeGroup(els, `sku-container:${sel}`)) break;
          }
        }
      }
    }

    // ── 전략 3: .item-label 그룹핑 (페이지 전체 긁지 않고, 같은 부모끼리만) ──
    if (skuMap.size < 2) {
      const labelGroups = new Map(); // 조부모 요소 → [item-label 목록]
      document.querySelectorAll('.item-label, [class*="item-label"]').forEach(el => {
        const parent = el.parentElement;
        const gp = parent && parent.parentElement;
        if (!gp) return;
        if (!labelGroups.has(gp)) labelGroups.set(gp, []);
        labelGroups.get(gp).push(parent); // label의 부모(li 또는 wrapper)를 수집
      });

      let bestGroup = [];
      for (const [, group] of labelGroups) {
        if (group.length >= 2 && group.length <= 25 && group.length > bestGroup.length)
          bestGroup = group;
      }
      if (bestGroup.length) mergeGroup(bestGroup, 'sku-label-group');
    }

    // ── 다차원 SKU: #skuSelection > .feature-item 기반 그룹 분리 ─────────────
    // 신형 1688 구조:
    //   #skuSelection > .feature-item
    //     .feature-item-label → 차원명(颜色, 规格 등)
    //     .transverse-filter > button.sku-filter-button > span.label-name → 색상 등 텍스트 버튼
    //     [class*="expand-view-item"] → 규격 등 가격 포함 아이템
    const sku_groups = [];
    const skuSelectors = ['#skuSelection', '[data-module="od_sku_selection"]', '[class*="skuSelection"]'];
    let skuSection = null;
    for (const sel of skuSelectors) {
      skuSection = document.querySelector(sel);
      if (skuSection) break;
    }

    if (skuSection) {
      const featureItems = skuSection.querySelectorAll('.feature-item, [class*="feature-item"]');
      featureItems.forEach(fi => {
        const labelEl = fi.querySelector('.feature-item-label, [class*="feature-item-label"]');
        const dimension = labelEl ? labelEl.textContent.trim().slice(0, 20) : '';

        // 방법 A: expand-view-item (규格 등 가격 있는 아이템)
        const expandEls = Array.from(fi.querySelectorAll('[class*="expand-view-item"]'));
        const expandItems = expandEls.map(el => extractSkuFromEl(el)).filter(Boolean);

        // 방법 B: sku-filter-button (색상 등 텍스트/이미지 버튼)
        const filterItems = [];
        if (expandItems.length === 0) {
          fi.querySelectorAll('.sku-filter-button, [class*="sku-filter-button"]').forEach(btn => {
            const nameEl = btn.querySelector('.label-name, [class*="label-name"]');
            const name = nameEl ? nameEl.textContent.trim() : btn.textContent.trim();
            if (!name || name.length > 40) return;
            const imgEl = btn.querySelector('img');
            const imageUrl = imgEl
              ? (imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy-src') || '')
              : '';
            filterItems.push({ name, price: 0, imageUrl: imageUrl.startsWith('http') ? imageUrl : '' });
          });
        }

        // 색상 차원 판별: filter-button 방식(expand-view-item 없음)이거나, 아이템에 이미지가 있는 경우
        const items = expandItems.length > 0 ? expandItems : filterItems;
        const isColorDim = expandItems.length === 0 || items.some(item => item.imageUrl);
        if (items.length > 0) sku_groups.push({ dimension, items, isColorDim });
      });
    }

    // sku_groups가 2개 이상이면 다차원, 아니면 빈 배열 (기존 flat skus 사용)
    R.sku_groups = sku_groups.length >= 2 ? sku_groups : [];

    // flat skus: sku_groups에서 추출한 모든 아이템으로 보강 (기존 skuMap 우선)
    if (R.sku_groups.length >= 2) {
      for (const group of R.sku_groups) {
        for (const item of group.items) {
          if (!skuMap.has(item.name)) skuMap.set(item.name, item);
        }
      }
    }

    R.skus = Array.from(skuMap.values());
    if (R.skus.length === 0) R.sku_debug.push('sku-extraction-failed');

    // SKU 이미지까지 통합된 최종 메인 이미지 배열 확정
    R.images = Array.from(imgSet);

    // 5. 상품 속성(Attributes) 추출
    const attrSels = [
      '[class*="attribute-item"]', '[class*="attributeItem"]',
      '.attributes-list .attributes-item', '[class*="attribute"] li',
      '[class*="props"] li'
    ];
    for (const sel of attrSels) {
      const els = document.querySelectorAll(sel);
      if (!els.length) continue;
      
      const attrs = Array.from(els).map(el => {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        // 주로 "브랜드 : 나이키" 처럼 콜론 표기이거나 클래스 요소 안에 좌우로 나뉨
        const parts = text.split(/[:：]/);
        if (parts.length >= 2) {
            return { name: parts[0].trim(), value: parts.slice(1).join(':').trim() };
        } else {
            // "Name Value" 구조 (스팬 두개인 경우)
            const spans = el.querySelectorAll('span, div');
            if(spans.length >= 2) {
                return { name: spans[0].textContent.trim(), value: spans[1].textContent.trim() };
            }
        }
        return null;
      }).filter(a => a && a.name && a.value && a.name.length < 20);

      if (attrs.length > 0) {
        R.attributes = attrs;
        R.attr_debug.push(`dom-attr-sel:${sel}:${attrs.length}`);
        break;
      }
    }

    // 폴백: 텍스트 검색으로 '재질', '원단' 찾기
    if (R.attributes.length === 0) {
      const matKeys = ['材质', '面料', '材料'];
      const text = document.body.innerText || '';
      for (const key of matKeys) {
        const idx = text.indexOf(key);
        if (idx > -1) {
          const after = text.slice(idx + key.length, idx + key.length + 30);
          const val = after.replace(/^[\s:：]+/, '').split(/\n/)[0].trim();
          if (val && val.length > 0 && val.length < 30) {
            R.attributes = [{ name: key, value: val }];
            R.attr_debug.push(`dom-attr-text:${key}`);
            break;
          }
        }
      }
    }

  } catch (err) {
    R.sku_debug.push(`dom-error:${err.message}`);
  }

  return R;
}

// ── 상세 이미지 추출 (일반 스크롤 영역 및 Shadow DOM 포함) ────────────────────
function extractDetailImages() {
  const images = new Set();

  // 1. Shadow DOM 내 이미지
  const shEl = document.querySelector('[class*="html-description"]');
  if (shEl && shEl.shadowRoot) {
    shEl.shadowRoot.querySelectorAll('img').forEach(i => {
      const u = i.getAttribute('src') || i.src || '';
      if (u.startsWith('http')) images.add(u);
    });
  }

  // 2. 일반 DOM 내 상세 이미지 컨테이너
  const detailSels = [
    '#desc-lazyload-container', '.content-detail', 
    '[class*="detail-content"]', '[class*="description"]'
  ];
  for (const sel of detailSels) {
    const containers = document.querySelectorAll(sel);
    containers.forEach(container => {
      container.querySelectorAll('img').forEach(i => {
        let u = i.getAttribute('data-src') || i.getAttribute('data-lazyload') || i.src || '';
        if (u.startsWith('//')) u = 'https:' + u;
        if (u.startsWith('http') && !u.includes('loading') && !u.includes('.gif')) {
           images.add(u);
        }
      });
    });
  }

  return Array.from(images);
}

// ── 메인 리스너: START_SCRAPE 요청 처리 ─────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'START_SCRAPE') return;

  (async () => {
    const log = (text) => {
      chrome.runtime.sendMessage({ type: 'SCRAPE_LOG', text });
    };

    try {
      log('화면 요소(DOM) 스크래핑을 시작합니다...');

      // 1. 핵심 상품 데이터 DOM 스크래핑 (제목, 가격, 속성, 썸네일, 옵션)
      const raw = scrapeFromDOM(log);
      log(`기본 스크래핑 완료 — 옵션 ${raw.skus.length}개 (sku_debug: ${raw.sku_debug.join(', ')})`);
      raw.skus.forEach((s, i) => log(`  sku[${i}] "${s.name}" img=${s.imageUrl || '없음'}`));
      if (raw.sku_groups.length >= 2) log(`  다차원 SKU: ${raw.sku_groups.map(g => `${g.dimension}(${g.items.length})`).join(' × ')}`);;

      // 2. 상세 이미지 렌더링을 유도하기 위한 부드러운 스크롤
      log('상세 이미지 탐색 중... (스크롤 다운)');
      await scrollToBottom();

      // 4. 상세 이미지 최종 긁어오기
      const detailImages = extractDetailImages();
      log(`상세 이미지 ${detailImages.length}개 탐색`);

      // 메인 이미지 및 중복 필터링
      const mainUrls = new Set(raw.images);
      const filteredDetail = detailImages.filter(u => !mainUrls.has(u));

      const result = {
        title_cn:      raw.title,
        price_min:     raw.price_min,
        images:        raw.images.slice(0, 10),
        detail_images: filteredDetail.slice(0, 20),
        skus:          raw.skus,
        sku_groups:    raw.sku_groups,
        attributes:    raw.attributes,
        scrape_method: raw.method,
        sku_debug:     raw.sku_debug,
        attr_debug:    raw.attr_debug,
      };

      log(`✅ DOM 크롤링 완료! (가격: ${result.price_min}¥, 옵션: ${result.skus.length}개, 이미지: ${result.images.length}장)`);

      chrome.runtime.sendMessage({ type: 'SCRAPE_DONE', result });
      chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });

    } catch (e) {
      log(`❌ 크롤링 에러 발생: ${e.message}`);
      chrome.runtime.sendMessage({ type: 'SCRAPE_ERROR', error: e.message });
      chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
    }
  })();

  return true;
});
