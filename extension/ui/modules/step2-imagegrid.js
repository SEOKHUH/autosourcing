// Step 2: 이미지 그리드 렌더링 + 배지 갱신

import { state } from './state.js';
import { $, dataUrlToArrayBuffer } from './utils.js';
import { IDB } from './idb.js';
import { openTextEraserModal } from './step2-text-eraser.js';
import { openThumbnailCropperModal } from './thumbnail-cropper.js';

let _showOptionPicker = null;
export function initImageGrid({ showOptionPicker }) {
  _showOptionPicker = showOptionPicker;
}

function dataUrlFromBuffer(buffer, mimeType) {
  return new Promise((resolve) => {
    const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function attachEditButtons(item, img, key) {
  const overlay = document.createElement('div');
  overlay.className = 'img-edit-overlay';

  const cropBtn = document.createElement('button');
  cropBtn.className   = 'img-edit-btn img-edit-crop';
  cropBtn.textContent = '크롭';
  cropBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const rec = await IDB.get(key);
    if (!rec) return;
    const dataUrl = await dataUrlFromBuffer(rec.buffer, rec.mimeType);
    openThumbnailCropperModal(dataUrl, async (newDataUrl) => {
      await IDB.put(key, dataUrlToArrayBuffer(newDataUrl), rec.url, 'image/jpeg');
      img.src = newDataUrl;
    });
  });

  const eraseBtn = document.createElement('button');
  eraseBtn.className   = 'img-edit-btn img-edit-erase';
  eraseBtn.textContent = '텍스트 제거';
  eraseBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const rec = await IDB.get(key);
    if (!rec) return;
    const dataUrl = await dataUrlFromBuffer(rec.buffer, rec.mimeType);
    openTextEraserModal(dataUrl, async (newDataUrl) => {
      await IDB.put(key, dataUrlToArrayBuffer(newDataUrl), rec.url, 'image/jpeg');
      img.src = newDataUrl;
    });
  });

  overlay.appendChild(cropBtn);
  overlay.appendChild(eraseBtn);
  item.appendChild(overlay);
}

export async function renderImageGrid() {
  const grid = $('img-grid');
  grid.innerHTML = '';
  const seenUrls = new Set();

  for (const key of [...state.allImages, ...state.skuThumbKeys]) {
    const rec = await IDB.get(key);
    if (!rec) continue;
    if (seenUrls.has(rec.url)) continue;
    seenUrls.add(rec.url);

    const url  = IDB.toObjectUrl(rec.buffer, rec.mimeType);
    const item = document.createElement('div');
    item.className  = 'img-grid-item';
    item.dataset.key = key;

    const img = document.createElement('img');
    img.src   = url;
    img.title = key;
    img.onerror = () => { if (item.parentNode) grid.removeChild(item); };

    refreshImageGridItem(item, img, key);
    img.addEventListener('click', (e) => { if (_showOptionPicker) _showOptionPicker(key, img, item, e); });
    item.appendChild(img);
    attachEditButtons(item, img, key);
    grid.appendChild(item);
  }

  for (const key of (state.croppedImageKeys || [])) {
    const rec = await IDB.get(key);
    if (!rec) continue;

    const url  = IDB.toObjectUrl(rec.buffer, rec.mimeType);
    const item = document.createElement('div');
    item.className   = 'img-grid-item crop-item';
    item.dataset.key = key;

    const img = document.createElement('img');
    img.src   = url;
    img.title = key;
    img.onerror = () => { if (item.parentNode) grid.removeChild(item); };

    refreshImageGridItem(item, img, key);
    img.addEventListener('click', (e) => { if (_showOptionPicker) _showOptionPicker(key, img, item, e); });
    item.appendChild(img);
    attachEditButtons(item, img, key);
    grid.appendChild(item);
  }
}

export function refreshImageGridItem(item, img, key) {
  item.querySelectorAll('.assign-badge').forEach(b => b.remove());
  img.classList.remove('on');

  for (const [optName, keys] of Object.entries(state.optionImageMap)) {
    const isActive = optName === '__default__' || state.selectedOptions.includes(optName);
    if (!isActive || !keys.includes(key)) continue;
    img.classList.add('on');
    const badge = document.createElement('span');
    badge.className  = 'assign-badge';
    badge.textContent = optName === '__default__' ? '✓' : (state.optionCustomNames[optName] || optName).slice(0, 3);
    item.appendChild(badge);
    break;
  }
}
