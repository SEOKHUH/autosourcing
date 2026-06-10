// Step 2.5: 상세 이미지 드래그 크롭 UI

import { state } from './state.js';
import { $, dataUrlToArrayBuffer } from './utils.js';
import { IDB } from './idb.js';
import { saveProgress } from './workspace.js';
import { openImageEditorModal } from './image-editor.js';

export async function renderDetailImgList() {
  const list = $('detail-img-list');
  list.innerHTML = '';
  state.croppedImages = [];
  state.croppedImageKeys = [];
  $('cropped-list').innerHTML = '';

  const imgEls = [];
  for (const key of state.detailImages) {
    const rec = await IDB.get(key);
    if (!rec) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'detail-img-item';
    const img = document.createElement('img');
    img.src      = IDB.toObjectUrl(rec.buffer, rec.mimeType);
    img.draggable = false;
    wrapper.appendChild(img);
    list.appendChild(wrapper);
    imgEls.push(img);
  }

  let startX = 0, startY = 0, selDiv = null, scrollRaf = null;

  function toListCoords(clientX, clientY) {
    const r = list.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function imgListRect(img) {
    const lr = list.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    return { left: ir.left - lr.left, top: ir.top - lr.top, right: ir.right - lr.left, bottom: ir.bottom - lr.top, width: ir.width, height: ir.height };
  }

  list.addEventListener('mousedown', e => {
    if (state.croppedImages.length >= 3) return;
    e.preventDefault();
    const p = toListCoords(e.clientX, e.clientY);
    startX = p.x; startY = p.y;
    selDiv = document.createElement('div');
    selDiv.className = 'crop-selection';
    list.appendChild(selDiv);
    document.addEventListener('mousemove', onDocMove);
    document.addEventListener('mouseup', onDocUp);
  });

  function updateSelDiv(clientX, clientY) {
    const p = toListCoords(clientX, clientY);
    selDiv.style.left   = `${Math.min(startX, p.x)}px`;
    selDiv.style.top    = `${Math.min(startY, p.y)}px`;
    selDiv.style.width  = `${Math.abs(p.x - startX)}px`;
    selDiv.style.height = `${Math.abs(p.y - startY)}px`;
  }

  function onDocMove(e) {
    if (!selDiv) return;
    updateSelDiv(e.clientX, e.clientY);
    const scrollEl = $('workspace-scroll');
    if (!scrollEl) return;
    const sr = scrollEl.getBoundingClientRect();
    const ZONE = 60;
    let speed = 0;
    if (e.clientY > sr.bottom - ZONE)   speed = (e.clientY - (sr.bottom - ZONE)) / ZONE * 6;
    else if (e.clientY < sr.top + ZONE) speed = (e.clientY - (sr.top    + ZONE)) / ZONE * 6;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    if (speed !== 0) {
      const doScroll = () => { scrollEl.scrollTop += speed; if (selDiv) scrollRaf = requestAnimationFrame(doScroll); };
      scrollRaf = requestAnimationFrame(doScroll);
    }
  }

  async function onDocUp(e) {
    if (!selDiv) return;
    document.removeEventListener('mousemove', onDocMove);
    document.removeEventListener('mouseup', onDocUp);
    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = null; }

    const selW = parseFloat(selDiv.style.width) || 0;
    const selH = parseFloat(selDiv.style.height) || 0;
    list.removeChild(selDiv); selDiv = null;
    if (selW < 10 || selH < 10) return;

    const p  = toListCoords(e.clientX, e.clientY);
    const sl = Math.min(startX, p.x), sr2 = Math.max(startX, p.x);
    const st = Math.min(startY, p.y), sb  = Math.max(startY, p.y);

    const segments = [];
    let totalH = 0, canvasW = 0;
    for (const img of imgEls) {
      if (!img.complete || !img.naturalWidth) continue;
      const r   = imgListRect(img);
      const ix1 = Math.max(sl, r.left), ix2 = Math.min(sr2, r.right);
      const iy1 = Math.max(st, r.top),  iy2 = Math.min(sb,  r.bottom);
      if (ix2 <= ix1 || iy2 <= iy1) continue;
      const scaleX = img.naturalWidth / r.width, scaleY = img.naturalHeight / r.height;
      segments.push({ img, cx: (ix1 - r.left) * scaleX, cy: (iy1 - r.top) * scaleY, cw: (ix2 - ix1) * scaleX, ch: (iy2 - iy1) * scaleY, drawH: iy2 - iy1, scaleX });
      totalH += iy2 - iy1; canvasW = Math.max(canvasW, ix2 - ix1);
    }
    if (!segments.length || totalH < 5) return;

    const scaleRef = segments[0].scaleX;
    const canvas   = document.createElement('canvas');
    canvas.width   = Math.round(canvasW * scaleRef);
    canvas.height  = Math.round(totalH  * scaleRef);
    const ctx      = canvas.getContext('2d');
    let drawY = 0;
    for (const seg of segments) {
      const dh = Math.round(seg.drawH * seg.scaleX);
      ctx.drawImage(seg.img, seg.cx, seg.cy, seg.cw, seg.ch, 0, drawY, canvas.width, dh);
      drawY += dh;
    }
    addCroppedImage(canvas.toDataURL('image/jpeg', 0.92));
  }
}

export async function addCroppedImage(dataUrl) {
  if (state.croppedImages.length >= 3) return;
  const key = `crop_${state.currentModalItemId}_${Date.now()}`;
  state.croppedImages.push(dataUrl);
  state.croppedImageKeys.push(key);
  await IDB.put(key, dataUrlToArrayBuffer(dataUrl), 'crop', 'image/jpeg');
  renderCroppedItem(dataUrl, key);
  saveProgress();
}

export function renderCroppedItem(dataUrl, key) {
  const item = document.createElement('div');
  item.className = 'cropped-item';
  const img = document.createElement('img');
  img.src = dataUrl;
  const del = document.createElement('button');
  del.className   = 'crop-del-btn';
  del.textContent = '×';
  del.addEventListener('click', () => {
    const idx = state.croppedImageKeys.indexOf(key);
    if (idx >= 0) {
      state.croppedImages.splice(idx, 1);
      state.croppedImageKeys.splice(idx, 1);
      IDB.remove(key).catch(() => {});
      saveProgress();
    }
    $('cropped-list').removeChild(item);
  });

  const eraseBtn = document.createElement('button');
  eraseBtn.className   = 'crop-erase-btn';
  eraseBtn.textContent = '텍스트 제거';
  eraseBtn.addEventListener('click', () => {
    const idx = state.croppedImageKeys.indexOf(key);
    if (idx < 0) return;
    const currentDataUrl = state.croppedImages[idx];
    openImageEditorModal(currentDataUrl, async (newDataUrl) => {
      const i = state.croppedImageKeys.indexOf(key);
      if (i < 0) return;
      state.croppedImages[i] = newDataUrl;
      await IDB.put(key, dataUrlToArrayBuffer(newDataUrl), 'crop', 'image/jpeg');
      img.src = newDataUrl;
      saveProgress();
    }, { enableCrop: false });
  });

  item.appendChild(img);
  item.appendChild(eraseBtn);
  item.appendChild(del);
  $('cropped-list').appendChild(item);
}
