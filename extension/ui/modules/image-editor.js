// 통합 이미지 편집 모달 — 크롭(선택) + 텍스트 제거
// openImageEditorModal(dataUrl, callback, { enableCrop: true })

import { $, appendGlobalLog, clientToCanvas as _clientToCanvas } from './utils.js';
import { getOcrWorker } from './ocr-worker.js';
import { fillBoxes }    from './inpaint.js';

const MIN_BOX_SIZE  = 8;
const X_BTN_SIZE    = 18;

// ── 모달 상태 ─────────────────────────────────────────────────
let canvas, ctx, modal;
let mode        = 'crop';   // 'crop' | 'erase'
let enableCrop  = true;

let originalImg     = null; // HTMLImageElement — 원본
let cropSelection   = null; // {x,y,w,h} — originalImg natural 좌표
let workingImg      = null; // HTMLImageElement — cropSelection 반영본 or originalImg
let displayScale    = 1;    // workingImg natural → canvas 표시 비율

// 크롭 탭 상태
let cropBox   = null;       // canvas 표시 좌표
let cropDrag  = null;       // {x, y}

// 텍스트 제거 탭 상태
let boxes     = [];         // canvas 표시 좌표
let history   = [];
let hoverIdx  = -1;
let eraseDrag = null;
let tempBox   = null;
let previewMode = false;

let onApplyCallback = null;

function clientToCanvas(e) { return _clientToCanvas(e, canvas); }

// ── OCR 유틸 ─────────────────────────────────────────────────
function mergeNearbyBoxes(input) {
  let result = input.map(b => ({ ...b }));
  if (!result.length) return result;

  let merged = true;
  while (merged) {
    merged = false;
    const avgH = result.reduce((s, b) => s + b.h, 0) / result.length;
    const yThr = avgH * 0.5;
    const xThr = avgH * 1.5;

    outer:
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i], b = result[j];
        const ayc = a.y + a.h / 2;
        const byc = b.y + b.h / 2;
        if (Math.abs(ayc - byc) > yThr) continue;

        const left  = a.x < b.x ? a : b;
        const right = a.x < b.x ? b : a;
        const gap   = right.x - (left.x + left.w);
        if (gap > xThr) continue;

        const nx = Math.min(a.x, b.x);
        const ny = Math.min(a.y, b.y);
        const nr = Math.max(a.x + a.w, b.x + b.w);
        const nb = Math.max(a.y + a.h, b.y + b.h);
        result.splice(j, 1);
        result.splice(i, 1);
        result.push({ x: nx, y: ny, w: nr - nx, h: nb - ny });
        merged = true;
        break outer;
      }
    }
  }
  return result;
}

// ── 렌더링 ───────────────────────────────────────────────────
function render() {
  if (!ctx || !workingImg) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mode === 'crop') {
    // 크롭 탭: 원본 기준으로 렌더링
    ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);
    if (cropBox) {
      // 외부 어두운 마스크
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, cropBox.y);
      ctx.fillRect(0, cropBox.y + cropBox.h, canvas.width, canvas.height - (cropBox.y + cropBox.h));
      ctx.fillRect(0, cropBox.y, cropBox.x, cropBox.h);
      ctx.fillRect(cropBox.x + cropBox.w, cropBox.y, canvas.width - (cropBox.x + cropBox.w), cropBox.h);
      // 박스 테두리
      ctx.lineWidth   = 2;
      ctx.strokeStyle = '#0ea5e9';
      ctx.setLineDash([]);
      ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
      // 3등분선
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth   = 1;
      for (let i = 1; i < 3; i++) {
        const vx = cropBox.x + (cropBox.w * i) / 3;
        ctx.beginPath(); ctx.moveTo(vx, cropBox.y); ctx.lineTo(vx, cropBox.y + cropBox.h); ctx.stroke();
        const vy = cropBox.y + (cropBox.h * i) / 3;
        ctx.beginPath(); ctx.moveTo(cropBox.x, vy); ctx.lineTo(cropBox.x + cropBox.w, vy); ctx.stroke();
      }
    }
  } else {
    // 텍스트 제거 탭: workingImg 기준
    ctx.drawImage(workingImg, 0, 0, canvas.width, canvas.height);
    if (previewMode) {
      fillBoxes(ctx, boxes, canvas.width, canvas.height);
    } else {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        const isHover = i === hoverIdx;
        ctx.lineWidth   = 2;
        ctx.strokeStyle = '#ef4444';
        ctx.setLineDash(isHover ? [6, 4] : []);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        if (isHover) {
          const r = getXBtnRect(b);
          ctx.setLineDash([]);
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = '#ef4444'; ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(r.x + 5, r.y + 5);           ctx.lineTo(r.x + r.w - 5, r.y + r.h - 5);
          ctx.moveTo(r.x + r.w - 5, r.y + 5);     ctx.lineTo(r.x + 5, r.y + r.h - 5);
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      if (tempBox) {
        ctx.lineWidth   = 2;
        ctx.strokeStyle = '#0ea5e9';
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(tempBox.x, tempBox.y, tempBox.w, tempBox.h);
        ctx.setLineDash([]);
      }
    }
  }
}

// ── X 버튼 hit test ──────────────────────────────────────────
function getXBtnRect(box) {
  return { x: box.x + box.w - X_BTN_SIZE, y: box.y, w: X_BTN_SIZE, h: X_BTN_SIZE };
}
function hitXBtn(x, y, idx) {
  if (idx < 0) return false;
  const r = getXBtnRect(boxes[idx]);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function hitBoxIndex(x, y) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
  }
  return -1;
}

// ── 히스토리 ──────────────────────────────────────────────────
function pushHistory() {
  history.push(JSON.parse(JSON.stringify(boxes)));
  if (history.length > 50) history.shift();
}
function undo() {
  if (!history.length) return;
  boxes = history.pop();
  hoverIdx = -1;
  render();
}

// ── 크롭 영역 hit test ───────────────────────────────────────
function insideCropBox(x, y) {
  if (!cropBox) return false;
  return x >= cropBox.x && x <= cropBox.x + cropBox.w &&
         y >= cropBox.y && y <= cropBox.y + cropBox.h;
}

// ── 크롭 이벤트 핸들러 ────────────────────────────────────────
// cropDrag: { x, y, mode: 'draw' | 'move', boxStart?: {x,y,w,h} }
function onCropMouseDown(e) {
  const { x, y } = clientToCanvas(e);
  if (insideCropBox(x, y)) {
    // 기존 영역 내부 클릭 → 이동 모드
    cropDrag = { x, y, mode: 'move', boxStart: { ...cropBox } };
  } else {
    // 빈 공간 클릭 → 새 영역 그리기
    cropDrag = { x, y, mode: 'draw' };
    cropBox  = { x, y, w: 0, h: 0 };
  }
  render();
}

function onCropMouseMove(e) {
  if (!cropDrag) return;
  const { x, y } = clientToCanvas(e);

  if (cropDrag.mode === 'move') {
    const dx = x - cropDrag.x;
    const dy = y - cropDrag.y;
    const bs = cropDrag.boxStart;
    let nx = bs.x + dx;
    let ny = bs.y + dy;
    nx = Math.max(0, Math.min(nx, canvas.width  - bs.w));
    ny = Math.max(0, Math.min(ny, canvas.height - bs.h));
    cropBox = { x: nx, y: ny, w: bs.w, h: bs.h };
  } else {
    let dx = x - cropDrag.x;
    let dy = y - cropDrag.y;
    const side = Math.min(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * side;
    dy = (dy < 0 ? -1 : 1) * side;
    cropBox = {
      x: dx < 0 ? cropDrag.x + dx : cropDrag.x,
      y: dy < 0 ? cropDrag.y + dy : cropDrag.y,
      w: Math.abs(dx),
      h: Math.abs(dy),
    };
    cropBox.x = Math.max(0, cropBox.x);
    cropBox.y = Math.max(0, cropBox.y);
    cropBox.w = Math.min(cropBox.w, canvas.width  - cropBox.x);
    cropBox.h = Math.min(cropBox.h, canvas.height - cropBox.y);
  }
  // 커서 업데이트
  if (!cropDrag) canvas.style.cursor = insideCropBox(x, y) ? 'move' : 'crosshair';
  render();
}

function onCropMouseUp() {
  if (!cropDrag) return;
  const wasDraw = cropDrag.mode === 'draw';
  cropDrag = null;
  if (wasDraw && cropBox && (cropBox.w < 10 || cropBox.h < 10)) {
    cropBox = null;
    render();
  }
}

// ── 텍스트 제거 이벤트 핸들러 ────────────────────────────────
function onEraseMouseDown(e) {
  if (previewMode) return;
  const { x, y } = clientToCanvas(e);
  if (hoverIdx >= 0 && hitXBtn(x, y, hoverIdx)) {
    pushHistory();
    boxes.splice(hoverIdx, 1);
    hoverIdx = -1;
    render();
    return;
  }
  if (hitBoxIndex(x, y) >= 0) return;
  eraseDrag = { x, y };
  tempBox   = { x, y, w: 0, h: 0 };
}

function onEraseMouseMove(e) {
  if (previewMode) return;
  const { x, y } = clientToCanvas(e);
  if (eraseDrag) {
    const dx = x - eraseDrag.x;
    const dy = y - eraseDrag.y;
    tempBox = {
      x: dx < 0 ? x : eraseDrag.x,
      y: dy < 0 ? y : eraseDrag.y,
      w: Math.abs(dx),
      h: Math.abs(dy),
    };
    render();
  } else {
    const idx = hitBoxIndex(x, y);
    if (idx !== hoverIdx) { hoverIdx = idx; render(); }
  }
}

function onEraseMouseUp(e) {
  if (previewMode) return;
  if (!eraseDrag) return;
  if (tempBox && tempBox.w >= MIN_BOX_SIZE && tempBox.h >= MIN_BOX_SIZE) {
    const nb = {
      x: Math.max(0, tempBox.x),
      y: Math.max(0, tempBox.y),
      w: tempBox.w,
      h: tempBox.h,
    };
    nb.w = Math.min(nb.w, canvas.width  - nb.x);
    nb.h = Math.min(nb.h, canvas.height - nb.y);
    if (nb.w >= MIN_BOX_SIZE && nb.h >= MIN_BOX_SIZE) {
      pushHistory();
      boxes.push(nb);
    }
  }
  eraseDrag = null;
  tempBox   = null;
  render();
}

function onEraseMouseLeave() {
  if (hoverIdx !== -1) { hoverIdx = -1; render(); }
}

// ── 모드 이벤트 연결/해제 ─────────────────────────────────────
function attachCropListeners() {
  canvas.addEventListener('mousedown', onCropMouseDown);
  canvas.addEventListener('mousemove', onCropMouseMove);
  canvas.addEventListener('mouseup',   onCropMouseUp);
}
function detachCropListeners() {
  canvas.removeEventListener('mousedown', onCropMouseDown);
  canvas.removeEventListener('mousemove', onCropMouseMove);
  canvas.removeEventListener('mouseup',   onCropMouseUp);
}
function attachEraseListeners() {
  canvas.addEventListener('mousedown',  onEraseMouseDown);
  canvas.addEventListener('mousemove',  onEraseMouseMove);
  canvas.addEventListener('mouseup',    onEraseMouseUp);
  canvas.addEventListener('mouseleave', onEraseMouseLeave);
}
function detachEraseListeners() {
  canvas.removeEventListener('mousedown',  onEraseMouseDown);
  canvas.removeEventListener('mousemove',  onEraseMouseMove);
  canvas.removeEventListener('mouseup',    onEraseMouseUp);
  canvas.removeEventListener('mouseleave', onEraseMouseLeave);
}

// ── 워킹 이미지 갱신 ─────────────────────────────────────────
// cropSelection(natural)을 적용해 workingImg를 인메모리 canvas로 교체한 뒤 Promise 반환
function applySelectionToWorkingImg() {
  if (!cropSelection) {
    workingImg = originalImg;
    return Promise.resolve();
  }
  const { x, y, w, h } = cropSelection;
  const offscreen  = document.createElement('canvas');
  offscreen.width  = w;
  offscreen.height = h;
  offscreen.getContext('2d').drawImage(originalImg, x, y, w, h, 0, 0, w, h);
  return new Promise(resolve => {
    const img  = new Image();
    img.onload = () => { workingImg = img; resolve(); };
    img.src    = offscreen.toDataURL('image/jpeg', 0.95);
  });
}

// ── displayScale 재계산 + 캔버스 크기 갱신 ────────────────────
function resetCanvasSize() {
  const wrap   = canvas.parentElement;
  const availW = wrap.clientWidth - 40;
  const availH = Math.floor(window.innerHeight * 0.9) - 50 - 48 - 40;
  const nat    = workingImg;
  displayScale  = Math.min(1, availW / nat.naturalWidth, availH / nat.naturalHeight);
  canvas.width  = Math.round(nat.naturalWidth  * displayScale);
  canvas.height = Math.round(nat.naturalHeight * displayScale);
}

// ── 탭 전환 ──────────────────────────────────────────────────
async function switchMode(next) {
  if (next === mode) return;

  if (mode === 'crop') {
    detachCropListeners();
    // cropBox → cropSelection (natural 좌표계로 변환)
    if (cropBox && cropBox.w >= 10 && cropBox.h >= 10) {
      // canvas 표시 좌표 → original natural 좌표
      const scaleToOrig = originalImg.naturalWidth / canvas.width;
      cropSelection = {
        x: Math.round(cropBox.x * scaleToOrig),
        y: Math.round(cropBox.y * scaleToOrig),
        w: Math.round(cropBox.w * scaleToOrig),
        h: Math.round(cropBox.h * scaleToOrig),
      };
      // 크롭된 이미지로 workingImg 교체
      await applySelectionToWorkingImg();
    }
    // 텍스트 제거 탭 초기화
    boxes = []; history = []; hoverIdx = -1; eraseDrag = null; tempBox = null; previewMode = false;
    updatePreviewButton();
    attachEraseListeners();
  } else {
    // erase → crop
    detachEraseListeners();
    // 박스 초기화
    boxes = []; history = []; hoverIdx = -1; eraseDrag = null; tempBox = null; previewMode = false;
    updatePreviewButton();
    // workingImg는 원본(크롭 탭에서는 originalImg 기준 렌더)
    workingImg = originalImg;
    attachCropListeners();
  }

  mode = next;
  // 캔버스 크기 재계산 (workingImg가 바뀌었을 수 있음)
  if (mode === 'erase') {
    resetCanvasSize();
  } else {
    // crop 탭으로 돌아갈 때: 항상 originalImg 기준
    const wrap   = canvas.parentElement;
    const availW = wrap.clientWidth - 40;
    const availH = Math.floor(window.innerHeight * 0.9) - 50 - 48 - 40;
    displayScale  = Math.min(1, availW / originalImg.naturalWidth, availH / originalImg.naturalHeight);
    canvas.width  = Math.round(originalImg.naturalWidth  * displayScale);
    canvas.height = Math.round(originalImg.naturalHeight * displayScale);
  }
  updateTabUI();
  render();
}

// ── UI 동기화 ─────────────────────────────────────────────────
function updateTabUI() {
  const tabCrop  = $('ie-tab-crop');
  const tabErase = $('ie-tab-erase');
  const toolCrop = $('ie-tools-crop');
  const toolErase= $('ie-tools-erase');

  if (tabCrop)  tabCrop.classList.toggle('active', mode === 'crop');
  if (tabErase) tabErase.classList.toggle('active', mode === 'erase');
  if (toolCrop)  toolCrop.classList.toggle('hidden', mode !== 'crop');
  if (toolErase) toolErase.classList.toggle('hidden', mode !== 'erase');

  const hint = $('ie-hint');
  if (hint) {
    hint.textContent = mode === 'crop'
      ? '드래그로 정사각형 크롭 영역을 지정하세요'
      : '지울 텍스트 영역을 드래그하거나 자동 감지를 사용하세요';
  }
}

function updatePreviewButton() {
  const btn = $('ie-btn-preview');
  if (!btn) return;
  btn.classList.remove('active');
  btn.textContent = '👁 미리보기';
}

// ── 크롭 초기화 ───────────────────────────────────────────────
function resetCrop() {
  cropBox = null; cropDrag = null;
  render();
}

// ── OCR 자동 감지 ─────────────────────────────────────────────
async function runAutoDetect() {
  const btn = $('ie-btn-detect');
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '🔍 감지 중...';
  appendGlobalLog('OCR 자동 감지 시작 (첫 실행 시 모델 로드 5~10초 소요)');
  try {
    const worker = await getOcrWorker();
    const offscreen = document.createElement('canvas');
    offscreen.width  = canvas.width;
    offscreen.height = canvas.height;
    offscreen.getContext('2d').drawImage(workingImg, 0, 0, canvas.width, canvas.height);
    const { data } = await worker.recognize(offscreen);
    const wordBoxes = (data.words || [])
      .filter(w => w.bbox && /[一-鿿]/.test(w.text || ''))
      .map(w => ({ x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 }))
      .filter(b => b.w >= MIN_BOX_SIZE && b.h >= MIN_BOX_SIZE);
    const merged = mergeNearbyBoxes(wordBoxes);
    pushHistory();
    boxes = [...boxes, ...merged];
    hoverIdx = -1;
    render();
    appendGlobalLog(`✅ OCR 완료: ${wordBoxes.length}개 단어 → ${merged.length}개 줄로 병합`);
  } catch (err) {
    appendGlobalLog('❌ OCR 실패: ' + err.message);
    console.error(err);
    alert('OCR 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = prevText;
  }
}

// ── 미리보기 토글 ─────────────────────────────────────────────
function togglePreview() {
  previewMode = !previewMode;
  const btn = $('ie-btn-preview');
  btn.classList.toggle('active', previewMode);
  btn.textContent = previewMode ? '👁 박스 보기' : '👁 미리보기';
  render();
}

// ── 적용 / 취소 ───────────────────────────────────────────────
function applyAndClose() {
  // crop 탭에서 바로 Apply 클릭한 경우 cropBox → activeCrop 변환
  let activeCrop = cropSelection;
  if (!activeCrop && cropBox && cropBox.w >= 10 && cropBox.h >= 10) {
    const scaleToOrig = originalImg.naturalWidth / canvas.width;
    activeCrop = {
      x: Math.round(cropBox.x * scaleToOrig),
      y: Math.round(cropBox.y * scaleToOrig),
      w: Math.round(cropBox.w * scaleToOrig),
      h: Math.round(cropBox.h * scaleToOrig),
    };
  }

  // 출력 캔버스: activeCrop 반영 + 원본 해상도
  let outW, outH, srcImg, srcX = 0, srcY = 0;
  if (activeCrop) {
    outW = activeCrop.w;
    outH = activeCrop.h;
    srcImg = originalImg;
    srcX = activeCrop.x;
    srcY = activeCrop.y;
  } else {
    outW = originalImg.naturalWidth;
    outH = originalImg.naturalHeight;
    srcImg = originalImg;
  }

  const out = document.createElement('canvas');
  out.width  = outW;
  out.height = outH;
  const outCtx = out.getContext('2d');
  outCtx.drawImage(srcImg, srcX, srcY, outW, outH, 0, 0, outW, outH);

  // 텍스트 제거 박스 역변환 → 출력 캔버스 좌표계
  if (boxes.length) {
    const fullBoxes = boxes.map(b => ({
      x: b.x / displayScale,
      y: b.y / displayScale,
      w: b.w / displayScale,
      h: b.h / displayScale,
    }));
    fillBoxes(outCtx, fullBoxes, outW, outH);
  }

  const dataUrl = out.toDataURL('image/jpeg', 0.92);
  const cb = onApplyCallback;
  closeModal();
  if (cb) cb(dataUrl);
}

function closeModal() {
  modal.classList.add('hidden');
  detachCropListeners();
  detachEraseListeners();

  $('ie-tab-crop')  ?.removeEventListener('click', onTabCropClick);
  $('ie-tab-erase') ?.removeEventListener('click', onTabEraseClick);
  $('ie-btn-crop-reset') ?.removeEventListener('click', resetCrop);
  $('ie-btn-detect')     ?.removeEventListener('click', runAutoDetect);
  $('ie-btn-preview')    ?.removeEventListener('click', togglePreview);
  $('ie-btn-undo')       ?.removeEventListener('click', undo);
  $('ie-btn-apply')      ?.removeEventListener('click', applyAndClose);
  $('ie-btn-cancel')     ?.removeEventListener('click', closeModal);

  // 상태 초기화
  mode = 'crop'; enableCrop = true;
  originalImg = null; cropSelection = null; workingImg = null; displayScale = 1;
  cropBox = null; cropDrag = null;
  boxes = []; history = []; hoverIdx = -1; eraseDrag = null; tempBox = null; previewMode = false;
  onApplyCallback = null;
}

// 탭 클릭 핸들러 (등록/해제 참조용 네임드 함수)
function onTabCropClick()  { switchMode('crop'); }
function onTabEraseClick() { switchMode('erase'); }

// ── 외부 진입점 ───────────────────────────────────────────────
export function openImageEditorModal(dataUrl, callback, options = {}) {
  enableCrop      = options.enableCrop !== false;
  onApplyCallback = callback;

  modal  = $('image-editor-modal');
  canvas = $('ie-canvas');
  ctx    = canvas.getContext('2d', { willReadFrequently: true });

  // 크롭 탭 표시 여부
  const tabCrop = $('ie-tab-crop');
  if (tabCrop) tabCrop.classList.toggle('hidden', !enableCrop);

  // 초기 모드 설정
  mode = enableCrop ? 'crop' : 'erase';

  const img = new Image();
  img.onload = () => {
    originalImg = img;
    workingImg  = img;

    modal.classList.remove('hidden');

    requestAnimationFrame(() => {
      // 크롭 탭이면 originalImg 기준, 텍스트 제거 탭이면 workingImg 기준
      const refImg = originalImg;
      const wrap   = canvas.parentElement;
      const availW = wrap.clientWidth - 40;
      const availH = Math.floor(window.innerHeight * 0.9) - 50 - 48 - 40;
      displayScale  = Math.min(1, availW / refImg.naturalWidth, availH / refImg.naturalHeight);
      canvas.width  = Math.round(refImg.naturalWidth  * displayScale);
      canvas.height = Math.round(refImg.naturalHeight * displayScale);

      // 상태 초기화
      cropBox = null; cropDrag = null;
      cropSelection = null;
      boxes = []; history = []; hoverIdx = -1; eraseDrag = null; tempBox = null; previewMode = false;

      // 이벤트 등록
      if (mode === 'crop') attachCropListeners();
      else                 attachEraseListeners();

      $('ie-tab-crop')  ?.addEventListener('click', onTabCropClick);
      $('ie-tab-erase') ?.addEventListener('click', onTabEraseClick);
      $('ie-btn-crop-reset') ?.addEventListener('click', resetCrop);
      $('ie-btn-detect')     ?.addEventListener('click', runAutoDetect);
      $('ie-btn-preview')    ?.addEventListener('click', togglePreview);
      $('ie-btn-undo')       ?.addEventListener('click', undo);
      $('ie-btn-apply')      ?.addEventListener('click', applyAndClose);
      $('ie-btn-cancel')     ?.addEventListener('click', closeModal);

      updateTabUI();
      render();
    });
  };
  img.onerror = () => {
    alert('이미지 로드 실패');
    onApplyCallback = null;
  };
  img.src = dataUrl;
}
