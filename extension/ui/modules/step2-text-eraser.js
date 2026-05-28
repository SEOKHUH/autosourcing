// 텍스트 제거 모달 — OCR 자동 감지 + 박스 수정 + 인페인팅
// Step 2 크롭 카드에서 호출.

import { $, appendGlobalLog } from './utils.js';
import { getOcrWorker } from './ocr-worker.js';
import { fillBoxes }   from './inpaint.js';

const MIN_BOX_SIZE = 8;
const X_BTN_SIZE   = 18;

let canvas, ctx, modal;
let originalImg = null;      // HTMLImageElement (원본)
let boxes = [];              // 확정 박스들
let history = [];            // 박스 상태 스냅샷 스택
let hoverIdx = -1;
let dragStart = null;        // {x, y} 또는 null
let tempBox = null;          // 드래그 중인 임시 박스
let previewMode = false;     // 인페인팅 결과 미리보기 상태
let onApplyCallback = null;  // 적용 시 호출할 콜백 (dataURL 반환)

// ── 좌표 변환 (CSS 크기 ≠ 캔버스 내부 해상도일 때 보정) ───────────
function clientToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
}

function pushHistory() {
  history.push(JSON.parse(JSON.stringify(boxes)));
  if (history.length > 50) history.shift();
}

function undo() {
  if (history.length === 0) return;
  boxes = history.pop();
  hoverIdx = -1;
  render();
}

// ── 박스 hit test ──────────────────────────────────────────────
function hitBoxIndex(x, y) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
  }
  return -1;
}

function getXBtnRect(box) {
  // 박스 우상단에 ✕ 버튼
  return {
    x: box.x + box.w - X_BTN_SIZE,
    y: box.y,
    w: X_BTN_SIZE,
    h: X_BTN_SIZE,
  };
}

function hitXBtn(x, y, idx) {
  if (idx < 0) return false;
  const r = getXBtnRect(boxes[idx]);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ── 박스 병합 — Tesseract 단어 박스 → 줄 단위 ─────────────────
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
        const gap = right.x - (left.x + left.w);
        if (gap > xThr) continue;

        // 병합 — bounding box
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
  if (!ctx || !originalImg) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

  if (previewMode) {
    // 박스 영역을 인페인팅 적용한 결과
    fillBoxes(ctx, boxes, canvas.width, canvas.height);
  } else {
    // 박스 오버레이
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
        ctx.lineWidth   = 1.5;
        ctx.strokeStyle = '#ef4444';
        ctx.stroke();
        // X 표시
        ctx.beginPath();
        ctx.moveTo(r.x + 5,           r.y + 5);
        ctx.lineTo(r.x + r.w - 5,     r.y + r.h - 5);
        ctx.moveTo(r.x + r.w - 5,     r.y + 5);
        ctx.lineTo(r.x + 5,           r.y + r.h - 5);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth   = 2;
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 드래그 중 임시 박스
    if (tempBox) {
      ctx.lineWidth   = 2;
      ctx.strokeStyle = '#0ea5e9';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(tempBox.x, tempBox.y, tempBox.w, tempBox.h);
      ctx.setLineDash([]);
    }
  }
}

// ── 이벤트 핸들러 ──────────────────────────────────────────────
function onMouseDown(e) {
  if (previewMode) return;
  const { x, y } = clientToCanvas(e);

  // 호버 박스의 ✕ 버튼 클릭 → 박스 삭제
  if (hoverIdx >= 0 && hitXBtn(x, y, hoverIdx)) {
    pushHistory();
    boxes.splice(hoverIdx, 1);
    hoverIdx = -1;
    render();
    return;
  }

  // 박스 내부 클릭 → 무시 (오작동 방지)
  if (hitBoxIndex(x, y) >= 0) return;

  // 빈 공간 → 드래그 시작
  dragStart = { x, y };
  tempBox = { x, y, w: 0, h: 0 };
}

function onMouseMove(e) {
  if (previewMode) return;
  const { x, y } = clientToCanvas(e);

  if (dragStart) {
    // 드래그 중 → 임시 박스 업데이트
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    tempBox = {
      x: dx < 0 ? x : dragStart.x,
      y: dy < 0 ? y : dragStart.y,
      w: Math.abs(dx),
      h: Math.abs(dy),
    };
    render();
  } else {
    // 호버 인덱스 추적
    const idx = hitBoxIndex(x, y);
    if (idx !== hoverIdx) {
      hoverIdx = idx;
      render();
    }
  }
}

function onMouseUp(e) {
  if (previewMode) return;
  if (!dragStart) return;
  if (tempBox && tempBox.w >= MIN_BOX_SIZE && tempBox.h >= MIN_BOX_SIZE) {
    // 캔버스 경계 내로 클램핑
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
  dragStart = null;
  tempBox = null;
  render();
}

function onMouseLeave() {
  if (hoverIdx !== -1) {
    hoverIdx = -1;
    render();
  }
}

// ── 자동 감지 ─────────────────────────────────────────────────
async function runAutoDetect() {
  const btn = $('te-btn-detect');
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '🔍 감지 중...';
  appendGlobalLog('OCR 자동 감지 시작 (첫 실행 시 모델 로드 5~10초 소요)');
  try {
    const worker = await getOcrWorker();
    // 박스 오버레이 없는 원본 이미지로 OCR (캔버스 그대로 넘기면 박스가 OCR에 노출됨)
    const offscreen = document.createElement('canvas');
    offscreen.width  = canvas.width;
    offscreen.height = canvas.height;
    offscreen.getContext('2d').drawImage(originalImg, 0, 0, canvas.width, canvas.height);
    const { data } = await worker.recognize(offscreen);
    const wordBoxes = (data.words || [])
      .filter(w => w.bbox && /[一-鿿]/.test(w.text || ''))
      .map(w => ({
        x: w.bbox.x0,
        y: w.bbox.y0,
        w: w.bbox.x1 - w.bbox.x0,
        h: w.bbox.y1 - w.bbox.y0,
      }))
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
  $('te-btn-preview').classList.toggle('active', previewMode);
  $('te-btn-preview').textContent = previewMode ? '👁 박스 보기' : '👁 미리보기';
  render();
}

// ── 적용 / 취소 / 닫기 ─────────────────────────────────────────
function applyAndClose() {
  // 인페인팅 확정
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);
  fillBoxes(ctx, boxes, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const cb = onApplyCallback;
  closeModal();
  if (cb) cb(dataUrl);
}

function closeModal() {
  modal.classList.add('hidden');
  // 리스너 정리
  canvas.removeEventListener('mousedown',  onMouseDown);
  canvas.removeEventListener('mousemove',  onMouseMove);
  canvas.removeEventListener('mouseup',    onMouseUp);
  canvas.removeEventListener('mouseleave', onMouseLeave);
  $('te-btn-detect').removeEventListener('click',  runAutoDetect);
  $('te-btn-preview').removeEventListener('click', togglePreview);
  $('te-btn-undo').removeEventListener('click',    undo);
  $('te-btn-apply').removeEventListener('click',   applyAndClose);
  $('te-btn-cancel').removeEventListener('click',  closeModal);
  // 상태 초기화
  boxes = [];
  history = [];
  hoverIdx = -1;
  dragStart = null;
  tempBox = null;
  previewMode = false;
  originalImg = null;
  onApplyCallback = null;
}

// ── 외부 진입점 ───────────────────────────────────────────────
export function openTextEraserModal(dataUrl, callback) {
  modal  = $('text-eraser-modal');
  canvas = $('te-canvas');
  ctx    = canvas.getContext('2d', { willReadFrequently: true });
  onApplyCallback = callback;

  const img = new Image();
  img.onload = () => {
    originalImg = img;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    boxes = [];
    history = [];
    hoverIdx = -1;
    dragStart = null;
    tempBox = null;
    previewMode = false;
    render();

    modal.classList.remove('hidden');

    // 리스너 등록
    canvas.addEventListener('mousedown',  onMouseDown);
    canvas.addEventListener('mousemove',  onMouseMove);
    canvas.addEventListener('mouseup',    onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);
    $('te-btn-detect').addEventListener('click',  runAutoDetect);
    $('te-btn-preview').addEventListener('click', togglePreview);
    $('te-btn-undo').addEventListener('click',    undo);
    $('te-btn-apply').addEventListener('click',   applyAndClose);
    $('te-btn-cancel').addEventListener('click',  closeModal);

    // 미리보기 버튼 텍스트 초기화
    $('te-btn-preview').classList.remove('active');
    $('te-btn-preview').textContent = '👁 미리보기';
  };
  img.onerror = () => {
    alert('이미지 로드 실패');
    onApplyCallback = null;
  };
  img.src = dataUrl;
}
