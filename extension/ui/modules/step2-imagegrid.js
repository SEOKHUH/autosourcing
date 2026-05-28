// Step 2: 이미지 그리드 렌더링 + 배지 갱신

import { state } from './state.js';
import { $ } from './utils.js';
import { IDB } from './idb.js';

let _showOptionPicker = null;
export function initImageGrid({ showOptionPicker }) {
  _showOptionPicker = showOptionPicker;
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
