// 썸네일 크롭 모달 — 단일 이미지에서 사각 영역 드래그 → 새 dataURL 반환
// Step 3 이미지 그리드의 "크롭" 버튼에서 호출.

import { $ } from './utils.js';

const MIN_CROP_SIZE = 10;

let canvas, ctx, modal;
let originalImg = null;
let dragStart = null;
let cropBox = null;          // {x, y, w, h} or null
let lockSquare = false;
let onApplyCallback = null;

function clientToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
}

function render() {
  if (!ctx || !originalImg) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

  if (cropBox) {
    // 어두운 마스크 (크롭 박스 외부)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, cropBox.y);
    ctx.fillRect(0, cropBox.y + cropBox.h, canvas.width, canvas.height - (cropBox.y + cropBox.h));
    ctx.fillRect(0, cropBox.y, cropBox.x, cropBox.h);
    ctx.fillRect(cropBox.x + cropBox.w, cropBox.y, canvas.width - (cropBox.x + cropBox.w), cropBox.h);

    // 크롭 박스 테두리
    ctx.lineWidth   = 2;
    ctx.strokeStyle = '#0ea5e9';
    ctx.setLineDash([]);
    ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);

    // 3등분선
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth   = 1;
    for (let i = 1; i < 3; i++) {
      const vx = cropBox.x + (cropBox.w * i) / 3;
      ctx.beginPath(); ctx.moveTo(vx, cropBox.y); ctx.lineTo(vx, cropBox.y + cropBox.h); ctx.stroke();
      const vy = cropBox.y + (cropBox.h * i) / 3;
      ctx.beginPath(); ctx.moveTo(cropBox.x, vy); ctx.lineTo(cropBox.x + cropBox.w, vy); ctx.stroke();
    }
  }
}

function onMouseDown(e) {
  const { x, y } = clientToCanvas(e);
  dragStart = { x, y };
  cropBox = { x, y, w: 0, h: 0 };
  render();
}

function onMouseMove(e) {
  if (!dragStart) return;
  const { x, y } = clientToCanvas(e);
  let dx = x - dragStart.x;
  let dy = y - dragStart.y;

  if (lockSquare) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * side;
    dy = (dy < 0 ? -1 : 1) * side;
  }

  cropBox = {
    x: dx < 0 ? dragStart.x + dx : dragStart.x,
    y: dy < 0 ? dragStart.y + dy : dragStart.y,
    w: Math.abs(dx),
    h: Math.abs(dy),
  };
  // 캔버스 경계 클램핑
  cropBox.x = Math.max(0, cropBox.x);
  cropBox.y = Math.max(0, cropBox.y);
  cropBox.w = Math.min(cropBox.w, canvas.width  - cropBox.x);
  cropBox.h = Math.min(cropBox.h, canvas.height - cropBox.y);
  render();
}

function onMouseUp() {
  if (!dragStart) return;
  dragStart = null;
  if (cropBox && (cropBox.w < MIN_CROP_SIZE || cropBox.h < MIN_CROP_SIZE)) {
    cropBox = null;
    render();
  }
}

function toggleSquareLock() {
  lockSquare = !lockSquare;
  $('tc-btn-square').classList.toggle('active', lockSquare);
  $('tc-btn-square').textContent = lockSquare ? '☑ 1:1' : '☐ 1:1';
}

function resetCrop() {
  cropBox = null;
  dragStart = null;
  render();
}

function applyAndClose() {
  if (!cropBox || cropBox.w < MIN_CROP_SIZE || cropBox.h < MIN_CROP_SIZE) {
    alert('크롭 영역을 드래그로 지정하세요');
    return;
  }
  const out = document.createElement('canvas');
  out.width  = Math.round(cropBox.w);
  out.height = Math.round(cropBox.h);
  out.getContext('2d').drawImage(
    originalImg,
    cropBox.x, cropBox.y, cropBox.w, cropBox.h,
    0, 0, out.width, out.height
  );
  const dataUrl = out.toDataURL('image/jpeg', 0.92);
  const cb = onApplyCallback;
  closeModal();
  if (cb) cb(dataUrl);
}

function closeModal() {
  modal.classList.add('hidden');
  canvas.removeEventListener('mousedown', onMouseDown);
  canvas.removeEventListener('mousemove', onMouseMove);
  canvas.removeEventListener('mouseup',   onMouseUp);
  $('tc-btn-square').removeEventListener('click', toggleSquareLock);
  $('tc-btn-reset').removeEventListener('click',  resetCrop);
  $('tc-btn-apply').removeEventListener('click',  applyAndClose);
  $('tc-btn-cancel').removeEventListener('click', closeModal);
  cropBox = null;
  dragStart = null;
  lockSquare = false;
  originalImg = null;
  onApplyCallback = null;
}

export function openThumbnailCropperModal(dataUrl, callback) {
  modal  = $('thumbnail-cropper-modal');
  canvas = $('tc-canvas');
  ctx    = canvas.getContext('2d');
  onApplyCallback = callback;

  const img = new Image();
  img.onload = () => {
    originalImg = img;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    cropBox = null;
    dragStart = null;
    lockSquare = false;
    render();

    modal.classList.remove('hidden');
    $('tc-btn-square').classList.remove('active');
    $('tc-btn-square').textContent = '☐ 1:1';

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    $('tc-btn-square').addEventListener('click', toggleSquareLock);
    $('tc-btn-reset').addEventListener('click',  resetCrop);
    $('tc-btn-apply').addEventListener('click',  applyAndClose);
    $('tc-btn-cancel').addEventListener('click', closeModal);
  };
  img.onerror = () => {
    alert('이미지 로드 실패');
    onApplyCallback = null;
  };
  img.src = dataUrl;
}
