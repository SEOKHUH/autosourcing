/**
 * supplier_hub.js — 쿠팡 서플라이어 허브 content script
 * - DRAFT_SAVE: Draft API 임시저장 (same-origin fetch로 CORS 우회)
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'DRAFT_SAVE') {
    handleDraftSave(msg).then(sendResponse).catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async
  }
});

async function handleDraftSave(msg) {
  const {
    productName, categoryPath, categoryId, displayCategoryCode, productNoticeNumber,
    supplyPrice, salePrice, optionName, mainImage, labelImage, detailImage,
  } = msg;

  const log = (text) => chrome.runtime.sendMessage({ type: 'DRAFT_LOG', text }).catch(() => { });

  // base64 → Blob 변환 헬퍼
  const b64ToBlob = (imgData, filename) => {
    if (!imgData) return null;
    const binary = atob(imgData.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: imgData.mimeType || 'image/png' });
  };

  // 1. 초안 생성
  await log('⏳ 초안 생성 중...');
  const createPayload = {
    docId: null, productName, categoryId, categoryPath,
    displayCategoryCode, productNoticeNumber,
    scope: 'Retail_Categorized_Single', version: 160, remark: null,
    jsonDocument: [{ startPage: { productName, categoryPath } }],
  };
  const createResp = await fetch('/sr/draft/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createPayload),
  });
  const createResult = await createResp.json();
  const docId = createResult.docId;
  if (!docId) return { ok: false, error: '초안 생성 실패: ' + JSON.stringify(createResult) };
  await log(`✅ 초안 생성 완료 (docId: ${docId})`);

  // 2. 이미지 업로드
  const uploadImg = async (imgData, imageType, filename) => {
    const blob = b64ToBlob(imgData);
    if (!blob) return null;
    const form = new FormData();
    form.append('additionalImageFiles', blob, filename);
    const resp = await fetch(`/sr/draft/api/upload-images/${docId}?imageType=${imageType}`, {
      method: 'POST', body: form,
    });
    const result = await resp.json();
    console.log(`[DRAFT upload ${imageType}]`, result);
    return result.imageFilename || result.filename || (Array.isArray(result) ? result[0] : null) || null;
  };

  const mainFilename = await uploadImg(mainImage, 'MAIN', 'main.jpg');
  if (mainFilename) await log('✅ 대표이미지 업로드 완료');

  const labelFilename = await uploadImg(labelImage, 'LABEL', 'label.png');
  if (labelFilename) await log('✅ 라벨 이미지 업로드 완료');
  else await log('⚠️ 라벨 이미지 없음 — Step 3에서 먼저 생성해주세요');

  const detailFilename = await uploadImg(detailImage, 'DETAIL', 'detail.png');
  if (detailFilename) await log('✅ 상세페이지 이미지 업로드 완료');
  else await log('⚠️ 상세페이지 이미지 없음 — Step 3에서 먼저 생성해주세요');

  // 3. 전체 jsonDocument 업데이트
  await log('⏳ 정보 업데이트 중...');
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
        { certificateName: '안전기증적합확인 신고번호', certificateValue: '해당사항없음' },
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
  const updateResp = await fetch('/sr/draft/api/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatePayload),
  });
  const updateResult = await updateResp.json();
  console.log('[DRAFT update]', updateResult);

  await log('🎉 임시저장 완료! 서플라이어 허브 → "중간 저장 불러오기"에서 불러오세요.');
  return { ok: true, docId };
}
