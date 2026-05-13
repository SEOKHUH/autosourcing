// Step 4: 서플라이어 허브 Draft API 임시저장
// CORS 우회: executeScript MAIN world on supplier.coupang.com tab

import { state } from './state.js';
import { $, appendGlobalLog } from './utils.js';
import { IDB } from './idb.js';
import { saveQueue } from './queue.js';

export async function startRegister() {
  if (!state.currentScrapeResult) { alert('상품 정보가 없습니다'); return; }
  const item = state.queueData[state.currentModalItemId];
  if (!item) { alert('상품 정보가 없습니다'); return; }

  $('register-done').classList.add('hidden');
  $('btn-start-register').disabled = true;

  try {
    const recToB64 = (rec) => {
      if (!rec) return null;
      const bytes = new Uint8Array(rec.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { base64: btoa(binary), mimeType: rec.mimeType || 'image/png' };
    };

    // 선택된 옵션 목록 (없거나 __default__면 단일 항목 처리)
    const hasOptions = state.selectedOptions.length > 0 &&
      !(state.selectedOptions.length === 1 && state.selectedOptions[0] === '__default__');

    // 색상 차원 옵션명 집합 (isColorDim 또는 이미지 있는 차원)
    const groups = state.currentScrapeResult?.sku_groups_translated || [];
    const colorNames = new Set(
      groups
        .filter(g => g.isColorDim || g.items.some(i => i.imageUrl) || /색상|색|컬러|颜色|色彩|色系|color/i.test(g.dimension_kr || g.dimension || ''))
        .flatMap(g => g.items.map(i => i.name_kr || i.name))
    );
    const colorOptionsFromGroups = hasOptions
      ? state.selectedOptions.filter(o => o !== '__default__' && colorNames.has(o))
      : [];
    const colorOptions = colorOptionsFromGroups.length > 0
      ? colorOptionsFromGroups
      : (hasOptions ? state.selectedOptions.filter(o => o !== '__default__') : []);

    // 옵션별 이미지 로드: optionImageMap → skuThumb → 첫 번째 대표 이미지 순 우선
    const skus = state.currentScrapeResult?.skus_translated || [];
    let skuList;
    if (colorOptions.length > 0) {
      skuList = await Promise.all(colorOptions.map(async (optName) => {
        let imgRec = null;
        const assignedKeys = state.optionImageMap[optName];
        if (assignedKeys?.length > 0) imgRec = await IDB.get(assignedKeys[0]);
        if (!imgRec) {
          const idx = skus.findIndex(s => s.name_kr === optName || s.name === optName);
          if (idx >= 0 && state.skuThumbKeys[idx]) imgRec = await IDB.get(state.skuThumbKeys[idx]);
        }
        if (!imgRec && state.allImages.length > 0) imgRec = await IDB.get(state.allImages[0]);
        return { optionName: optName, imgB64: recToB64(imgRec) };
      }));
    } else {
      const mainRec = state.allImages.length > 0 ? await IDB.get(state.allImages[0]) : null;
      skuList = [{ optionName: '', imgB64: recToB64(mainRec) }];
    }

    const labelRec = await IDB.get('label_' + state.currentModalItemId);
    const detailRec = await IDB.get('detail_' + state.currentModalItemId);

    // 서플라이어 허브 탭 확보
    const tabs = await new Promise(r => chrome.tabs.query({ url: 'https://supplier.coupang.com/*' }, r));
    let tabId;
    if (tabs.length > 0) {
      tabId = tabs[0].id;
    } else {
      appendGlobalLog('⏳ 서플라이어 허브 탭 여는 중...');
      const newTab = await new Promise(r => chrome.tabs.create({ url: 'https://supplier.coupang.com/', active: false }, r));
      await new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(id, info) {
          if (id === newTab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); resolve(); }
        });
      });
      tabId = newTab.id;
    }

    const productName = '헤오르 ' + $('f-name').value.trim();
    const categoryPath = item.categoryPath || $('f-category').value;
    const categoryId = item.categoryId;
    const displayCatCode = item.displayCategoryCode;
    const productNoticeNum = item.productNoticeNumber || 38;
    const supplyPrice = parseInt($('f-supply').value) || 0;
    const salePrice = parseInt($('f-selling').value) || 0;
    const qty = $('f-qty').value.trim() || '1개';

    appendGlobalLog('⏳ 임시저장 중...');

    const results = await new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async (p) => {
          const b64ToBlob = (img) => {
            if (!img) return null;
            const bin = atob(img.base64);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            return new Blob([buf], { type: 'application/octet-stream' });
          };
          const toJpegBlob = (img) => new Promise((resolve) => {
            if (!img) { resolve(null); return; }
            const blob = b64ToBlob(img);
            if (!blob) { resolve(null); return; }
            const url = URL.createObjectURL(blob);
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              canvas.getContext('2d').drawImage(image, 0, 0);
              URL.revokeObjectURL(url);
              canvas.toBlob(resolve, 'image/jpeg', 0.92);
            };
            image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            image.src = url;
          });
          const logs = [];

          // 초안 생성
          const cr = await fetch('/sr/draft/api/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docId: null, productName: p.productName, categoryId: p.categoryId,
              categoryPath: p.categoryPath, displayCategoryCode: p.displayCatCode,
              productNoticeNumber: p.productNoticeNum,
              scope: 'Retail_Categorized_Single', version: 164, remark: null,
              jsonDocument: [{ startPage: { productName: p.productName, categoryPath: p.categoryPath } }],
            }),
          });
          const crj = await cr.json();
          const docId = crj.docId;
          if (!docId) return { ok: false, error: '초안 생성 실패: ' + JSON.stringify(crj), logs };
          logs.push(`✅ 초안 생성 완료 (docId: ${docId})`);

          // 스키마 API에서 notices 항목명 + adCert 기본값 추출
          const fallbackNotices = [
            { noticeItemName: '품명 및 모델명', noticeItemValue: '컨텐츠 참조' },
            { noticeItemName: '인증/허가 사항', noticeItemValue: '컨텐츠 참조' },
            { noticeItemName: '제조국(원산지)', noticeItemValue: '컨텐츠 참조' },
            { noticeItemName: '제조자(수입자)', noticeItemValue: '컨텐츠 참조' },
            { noticeItemName: '소비자상담 관련 전화번호', noticeItemValue: '컨텐츠 참조' },
          ];
          let noticeItems = p.noticeItems || [];
          let adCertValue = '';
          try {
            const sr = await fetch(`/sr/schema/api/get-default-schemaform?internalDisplayCode=${p.displayCatCode}&useCustomizedJsonSchema=true`);
            const sj = await sr.json();
            if (sj.schemaString) {
              const ss = JSON.parse(sj.schemaString);
              const noticeProp = ss.properties?.legalPage?.properties?.notices;
              if (noticeProp?.examples?.[0]) {
                noticeItems = noticeProp.examples[0].map(n => n.noticeItemName).filter(Boolean);
                logs.push(`✅ notices ${noticeItems.length}개 스키마에서 로드`);
              }
            }
          } catch (e) {
            logs.push(`⚠️ schema fetch 실패 (폴백 사용): ${e.message}`);
          }
          const notices = noticeItems.length > 0
            ? noticeItems.map(name => ({ noticeItemName: name, noticeItemValue: '컨텐츠 참조' }))
            : fallbackNotices;
          const legalPage = {
            kcMarkType: '해당사항없음',
            certificates: [
              { certificateName: '전기용품 및 생활용품, 어린이 (KC) 인증번호', certificateValue: '해당사항없음' },
              { certificateName: '방송통신 기자재 (EMC) 인증 번호', certificateValue: '해당사항없음' },
              { certificateName: 'KCS 인증번호', certificateValue: '해당사항없음' },
              { certificateName: '안전기준적합확인 신고번호', certificateValue: '해당사항없음' },
            ],
            adCert: adCertValue,
            notices,
          };
          const makeSkuEntry = (sku, mainFn, labelFn, detailFn) => ({
            startPage: { productName: p.productName, categoryPath: p.categoryPath },
            productPage: {
              modelNumber: p.productName,
              brand: '브랜드 없음',
              commonAttributes: {
                exposedAttributes: [
                  ...(sku.optionName ? [{ attributeName: '색상', attributeValue: (p.optionCustomNames && p.optionCustomNames[sku.optionName]) || sku.optionName }] : []),
                  { attributeName: '수량', attributeValue: p.qty },
                  { attributeName: '사이즈', attributeValue: (p.attributes || []).find(a => a.name === '사양')?.value || 'one size' },
                ],
                purchasePrice: p.supplyPrice,
                coupangSalePrice: p.salePrice,
                productBarcode: '바코드 없음(쿠팡 바코드 생성 요청)',
              },
              manufacturer: '헤오르 협력사',
              businessType: '기타 도소매업자',
              taxationSchema: '과세',
              importType: '수입상품',
              searchTags: '',
              unexposedAttributes: [],
            },
            imagePage: {
              images: {
                mainImage: mainFn || ' ',
                additionalImage: ' ',
                labelImages: labelFn
                  ? [{ labelImageType: '제품 한글 표시사항 라벨 또는 도안 이미지', labelImageFiles: labelFn }]
                  : [{ labelImageType: '제품 한글 표시사항 라벨 또는 도안 이미지', labelImageFiles: '' }],
              },
              details: { detailedImage: detailFn || ' ', htmlProductDetailContent: ' ', altText: p.productName },
              msrpAgree: true,
            },
            legalPage,
            logisticsPage: {
              totalSKUsInBox: 30, daysToExpiration: 365,
              specialHandlingReason: '해당사항없음', skuUnitBoxWeight: '500', skuUnitBoxDimension: '150*300*400',
              fashionYear: String(new Date().getFullYear()), fashionSeason: '사계절',
            },
            sourcingPage: { sourcingChannelType: '', sourcingChannelId: '' },
          });

          // Pre-update: 이미지 업로드 전 imagePage 구조를 서버에 먼저 저장 (업로드 API가 이를 필요로 함)
          await fetch('/sr/draft/api/update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docId, productName: p.productName, categoryId: p.categoryId,
              categoryPath: p.categoryPath, displayCategoryCode: p.displayCatCode,
              productNoticeNumber: p.productNoticeNum,
              scope: 'Retail_Categorized_Single', version: 164, remark: null,
              jsonDocument: p.skuList.map(sku => makeSkuEntry(sku, null, null, null)),
            }),
          });
          logs.push('✅ 초안 구조 저장 완료');

          // 이미지 업로드 헬퍼 — 응답은 배열 형태: [{ imageName: "xxx.jpg", ... }]
          const upload = async (imgData, imageType, filename) => {
            const blob = b64ToBlob(imgData);
            if (!blob) { logs.push(`⚠️ 이미지 없음 (${imageType}/${filename})`); return null; }
            const form = new FormData();
            form.append('additionalImageFiles', blob, filename);
            const r = await fetch(`/sr/draft/api/upload-images/${docId}?imageType=${imageType}`, { method: 'POST', body: form });
            const j = await r.json();
            logs.push(`[upload ${imageType}] status=${r.status} resp=${JSON.stringify(j).slice(0, 120)}`);
            return Array.isArray(j) ? (j[0]?.imageName || null) : (j?.imageName || null);
          };

          // 공통 이미지 먼저 업로드
          const labelFn = await upload(p.labelImage, 'LABEL', 'label.png');
          if (labelFn) logs.push('✅ 라벨 이미지 업로드 완료');
          else logs.push('⚠️ 라벨 이미지 없음 — Step 3에서 먼저 생성해주세요');

          const detailFn = await upload(p.detailImage, 'DETAIL', 'detail.png');
          if (detailFn) logs.push('✅ 상세페이지 이미지 업로드 완료');
          else logs.push('⚠️ 상세페이지 이미지 없음 — Step 3에서 먼저 생성해주세요');

          // SKU별 MAIN 이미지 업로드 및 jsonDocument 항목 생성
          const jsonDocument = [];
          for (let i = 0; i < p.skuList.length; i++) {
            const sku = p.skuList[i];
            const jpegBlob = await toJpegBlob(sku.imgB64);
            let mainFn = null;
            if (jpegBlob) {
              const form = new FormData();
              form.append('additionalImageFiles', jpegBlob, `main_${i}.jpg`);
              const r = await fetch(`/sr/draft/api/upload-images/${docId}?imageType=MAIN`, { method: 'POST', body: form });
              const j = await r.json();
              logs.push(`[upload MAIN] status=${r.status} resp=${JSON.stringify(j)}`);
              mainFn = Array.isArray(j) ? (j[0]?.imageName || null) : (j?.imageName || null);
            } else {
              logs.push(`⚠️ MAIN 이미지 변환 실패 (${sku.optionName || 'default'})`);
            }
            if (mainFn) logs.push(`✅ 대표이미지 업로드 완료${sku.optionName ? ' (' + sku.optionName + ')' : ''}`);
            jsonDocument.push(makeSkuEntry(sku, mainFn, labelFn, detailFn));
          }

          // 전체 데이터 update
          const ur = await fetch('/sr/draft/api/update', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docId, productName: p.productName, categoryId: p.categoryId,
              categoryPath: p.categoryPath, displayCategoryCode: p.displayCatCode,
              productNoticeNumber: p.productNoticeNum,
              scope: 'Retail_Categorized_Single', version: 164, remark: null, jsonDocument,
            }),
          });
          await ur.json();
          logs.push('🎉 임시저장 완료! 서플라이어 허브 → "중간 저장 불러오기"에서 불러오세요.');
          return { ok: true, docId, logs };
        },
        args: [{
          productName, categoryPath, categoryId, displayCatCode, productNoticeNum,
          supplyPrice, salePrice, qty, skuList,
          optionCustomNames: state.optionCustomNames,
          noticeItems: item.productNoticeItems || [],
          labelImage: recToB64(labelRec),
          detailImage: recToB64(detailRec),
          attributes: state.currentScrapeResult?.attrs_translated || [],
        }],
      }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res?.[0]?.result);
      });
    });

    if (results?.logs) results.logs.forEach(appendGlobalLog);
    if (results?.ok) {
      item.draftDocId = results.docId;
      saveQueue();
      $('register-done').classList.remove('hidden');
    } else {
      appendGlobalLog('❌ 임시저장 실패: ' + (results?.error || '알 수 없는 오류'));
    }
  } catch (e) {
    appendGlobalLog('❌ 임시저장 오류: ' + e.message);
  } finally {
    $('btn-start-register').disabled = false;
  }
}
