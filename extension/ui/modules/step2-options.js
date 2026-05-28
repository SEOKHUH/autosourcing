// Step 2: 옵션 카드 렌더링 + 옵션↔이미지 매칭 팝업

import { state } from './state.js';
import { $, showToast } from './utils.js';
import { IDB } from './idb.js';
import { refreshImageGridItem } from './step2-imagegrid.js';
import { saveProgress } from './workspace.js';
import { onSkuChange } from './step1-form.js';

export async function renderOptionCards(skus, skuGroups = null) {
  const container = $('option-cards');
  container.innerHTML = '';
  state.optionAssignedRowEls = {};

  if (!skus.length) {
    container.innerHTML = '<div style="color:#aaa;font-size:12px;padding:4px 0 8px">옵션 정보가 없는 상품입니다. 아래 이미지를 클릭해 대표 이미지를 선택해주세요.</div>';
    state.activeOptionName = '__default__';
    if (!state.optionImageMap['__default__']) state.optionImageMap['__default__'] = [];
    return;
  }

  if (skuGroups?.length >= 2) {
    const COLOR_RE = /색상|색깔|컬러|颜色|色彩|色系|color/i;
    const sorted = [...skuGroups].sort((a, b) => {
      const aIsColor = a.isColorDim || a.items.some(i => i.imageUrl) || COLOR_RE.test(a.dimension_kr || a.dimension || '');
      const bIsColor = b.isColorDim || b.items.some(i => i.imageUrl) || COLOR_RE.test(b.dimension_kr || b.dimension || '');
      return (aIsColor ? 1 : 0) - (bIsColor ? 1 : 0);
    });
    for (const group of sorted) {
      const isColor = group.isColorDim || group.items.some(item => item.imageUrl) || COLOR_RE.test(group.dimension_kr || group.dimension || '');
      const label = document.createElement('div');
      label.className  = 'sku-dim-label';
      label.textContent = group.dimension_kr || group.dimension || '옵션';
      container.appendChild(label);
      if (isColor) await renderSkuCards(group.items, container);
      else renderSkuChips(group.items, container);
    }
    return;
  }

  await renderSkuCards(skus, container);
}

async function renderSkuCards(skus, container) {
  for (const s of skus) {
    const name = s.name_kr || s.name;
    if (!state.optionImageMap[name]) state.optionImageMap[name] = [];

    if (s.imageUrl && state.optionImageMap[name].length === 0) {
      for (const key of [...state.skuThumbKeys, ...state.allImages]) {
        const rec = await IDB.get(key);
        if (rec && rec.url === s.imageUrl) { state.optionImageMap[name].push(key); break; }
      }
    }

    let thumbSrc = null;
    const mappedKey = state.optionImageMap[name][0];
    if (mappedKey) {
      const rec = await IDB.get(mappedKey);
      if (rec) thumbSrc = IDB.toObjectUrl(rec.buffer, rec.mimeType);
    }
    if (!thumbSrc && s.imageUrl) thumbSrc = s.imageUrl;

    const card = document.createElement('div');
    card.className    = 'option-card';
    card.dataset.option = name;

    const checkBadge = document.createElement('div');
    checkBadge.className  = 'option-check-badge';
    checkBadge.textContent = '✓';
    card.appendChild(checkBadge);

    const row         = document.createElement('div');
    row.className     = 'option-card-row';
    const placeholder = document.createElement('div');
    placeholder.className  = 'option-thumb-placeholder';
    placeholder.textContent = '📦';

    if (thumbSrc) {
      const thumb = document.createElement('img');
      thumb.className = 'option-thumb';
      thumb.src       = thumbSrc;
      thumb.onerror   = () => thumb.replaceWith(placeholder);
      row.appendChild(thumb);
    } else if (s.imageUrl) {
      row.appendChild(placeholder);
    } else {
      card.classList.add('no-thumb');
    }

    const info    = document.createElement('div');
    info.className = 'option-info';
    const nameEl  = document.createElement('div');
    nameEl.className  = 'option-name';
    nameEl.textContent = name;
    const priceEl = document.createElement('div');
    priceEl.className  = 'option-price';
    priceEl.textContent = s.price ? `¥${s.price}` : '';
    info.appendChild(nameEl);
    info.appendChild(priceEl);
    row.appendChild(info);
    card.appendChild(row);

    card.addEventListener('click', () => {
      if (state.selectedOptions.includes(name)) {
        state.selectedOptions = state.selectedOptions.filter(n => n !== name);
        delete state.optionCustomNames[name];
        card.classList.remove('selected');
        activateOption(name);
        onSkuChange();
        saveProgress();
      } else {
        showNameInputPopup(card, name);
      }
    });

    container.appendChild(card);
  }
}

function renderSkuChips(skus, container) {
  const chipRow = document.createElement('div');
  chipRow.className = 'sku-dim-chips';
  for (const s of skus) {
    const name = s.name_kr || s.name;
    if (!state.optionImageMap[name]) state.optionImageMap[name] = [];
    const chip = document.createElement('button');
    chip.className    = 'sku-chip';
    chip.dataset.option = name;
    chip.textContent  = name + (s.price ? ` ¥${s.price}` : '');
    chip.addEventListener('click', () => {
      if (state.selectedOptions.includes(name)) {
        state.selectedOptions = state.selectedOptions.filter(n => n !== name);
        chip.classList.remove('selected');
      } else {
        state.selectedOptions.push(name);
        chip.classList.add('selected');
      }
      onSkuChange();
      saveProgress();
    });
    chipRow.appendChild(chip);
  }
  container.appendChild(chipRow);
}

function showNameInputPopup(card, originalName) {
  document.querySelectorAll('.option-name-popup').forEach(p => p.remove());

  const popup = document.createElement('div');
  popup.className = 'option-name-popup';

  const label = document.createElement('div');
  label.className = 'option-name-popup-label';
  label.textContent = '서플라이어 허브 표기 옵션명';
  popup.appendChild(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'option-name-popup-input';
  input.value = state.optionCustomNames[originalName] || originalName;
  popup.appendChild(input);

  const btnRow = document.createElement('div');
  btnRow.className = 'option-name-popup-btns';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-ghost btn-sm';
  cancelBtn.textContent = '취소';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-blue btn-sm';
  confirmBtn.textContent = '확인';
  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  popup.appendChild(btnRow);

  document.body.appendChild(popup);
  const rect = card.getBoundingClientRect();
  popup.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 130)}px`;
  popup.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - 220))}px`;
  input.focus();
  input.select();

  const confirm = () => {
    const customName = input.value.trim() || originalName;
    state.optionCustomNames[originalName] = customName;
    state.selectedOptions.push(originalName);
    card.classList.add('selected');
    popup.remove();
    activateOption(originalName);
    onSkuChange();
    saveProgress();
  };

  confirmBtn.addEventListener('click', e => { e.stopPropagation(); confirm(); });
  cancelBtn.addEventListener('click', e => { e.stopPropagation(); popup.remove(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.stopPropagation(); confirm(); }
    if (e.key === 'Escape') { e.stopPropagation(); popup.remove(); }
  });
  popup.addEventListener('click', e => e.stopPropagation());
  setTimeout(() => { document.addEventListener('click', () => popup.remove(), { once: true }); }, 0);
}

export function activateOption(optionName) {
  state.activeOptionName = optionName;
  document.querySelectorAll('.option-card').forEach(card => {
    card.classList.toggle('active', card.dataset.option === optionName);
  });
}

export function showOptionPicker(imgKey, imgEl, itemEl, e) {
  document.querySelectorAll('.option-picker-popup').forEach(p => p.remove());

  if (state.selectedOptions.length === 0) {
    showToast('먼저 옵션 카드를 클릭해 사입할 옵션을 선택하세요');
    return;
  }

  const groups       = state.currentScrapeResult?.sku_groups_translated || [];
  const colorGroups  = groups.filter(g => g.isColorDim || g.items.some(item => item.imageUrl));
  const colorOptionNames = new Set(colorGroups.flatMap(g => g.items.map(item => item.name_kr || item.name)));
  const pickerOptions = colorGroups.length > 0
    ? state.selectedOptions.filter(o => o === '__default__' || colorOptionNames.has(o))
    : state.selectedOptions;

  if (pickerOptions.length === 0) { showToast('이미지 매칭 가능한 색상 옵션이 없습니다'); return; }
  if (pickerOptions.length === 1) { toggleImageAssignmentTo(imgKey, imgEl, itemEl, pickerOptions[0]); return; }

  const popup = document.createElement('div');
  popup.className = 'option-picker-popup';
  const title = document.createElement('div');
  title.className  = 'option-picker-title';
  title.textContent = '매칭할 옵션 선택';
  popup.appendChild(title);

  pickerOptions.forEach(optName => {
    const isAssigned = (state.optionImageMap[optName] || []).includes(imgKey);
    const btn = document.createElement('button');
    btn.className  = 'option-picker-btn' + (isAssigned ? ' assigned' : '');
    btn.textContent = (isAssigned ? '✓ ' : '') + (state.optionCustomNames[optName] || optName);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleImageAssignmentTo(imgKey, imgEl, itemEl, optName);
      popup.remove();
    });
    popup.appendChild(btn);
  });

  const rect = itemEl.getBoundingClientRect();
  popup.style.top  = `${Math.min(rect.bottom + 4, window.innerHeight - 160)}px`;
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
  document.body.appendChild(popup);
  setTimeout(() => { document.addEventListener('click', () => popup.remove(), { once: true }); }, 0);
}

export function toggleImageAssignmentTo(imgKey, imgEl, itemEl, optName) {
  if (!state.optionImageMap[optName]) state.optionImageMap[optName] = [];
  const keys = state.optionImageMap[optName];
  const idx  = keys.indexOf(imgKey);
  if (idx >= 0) keys.splice(idx, 1);
  else keys.unshift(imgKey);
  refreshImageGridItem(itemEl, imgEl, imgKey);
  saveProgress();
}
