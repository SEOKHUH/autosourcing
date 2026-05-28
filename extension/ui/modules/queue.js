// 대기열 관리: 추가·렌더링·삭제·재시도·저장·로드

import { state } from './state.js';
import { $, esc, statusLabel, statusIcon, appendGlobalLog, showToast } from './utils.js';

// openDetailView, closeDetailView는 순환 의존 방지를 위해 콜백으로 주입
let _openDetailView  = null;
let _closeDetailView = null;

export function initQueue({ openDetailView, closeDetailView }) {
  _openDetailView  = openDetailView;
  _closeDetailView = closeDetailView;
}

export function renderQueue() {
  const scroll = $('queue-scroll');
  const items  = Object.values(state.queueData).sort((a, b) => b.ts - a.ts);

  const badgeEl = document.getElementById('badge-queue');
  if (badgeEl) badgeEl.textContent = items.length;

  if (!items.length) {
    scroll.innerHTML = '<div class="queue-empty-msg">추가된 상품이 없어요</div>';
    return;
  }

  scroll.innerHTML = items.map(item => {
    const badge  = statusLabel(item.status);
    const active = item.id === state.currentItemId ? 'active' : '';
    const thumbHtml = item.thumb
      ? `<img class="q-thumb" src="${esc(item.thumb)}" alt="">`
      : `<div class="q-thumb-placeholder">${statusIcon(item.status)}</div>`;
    const retryBtn = (item.status === 'error')
      ? `<button class="q-retry-btn" data-action="retry" data-id="${esc(item.id)}">↺ 재크롤링</button>`
      : '';
    const stepLabels = ['', '정보 검수 중', '이미지 크롭 중', '등록 준비 완료'];
    const progressBadge = (item.progress && item.status === 'review')
      ? `<span class="q-progress-badge">Step ${item.progress.step} · ${stepLabels[item.progress.step] || ''}</span>`
      : '';
    return `<div class="q-card ${active}" data-id="${esc(item.id)}">
      <button class="q-del-btn" data-action="delete" data-id="${esc(item.id)}" title="삭제">×</button>
      ${thumbHtml}
      <div class="q-card-body">
        <span class="q-badge badge-${esc(item.status)}">${badge}</span>
        <div class="q-name">${esc(item.title_kr || '크롤링 중...')}</div>
        ${progressBadge}
        ${retryBtn}
      </div>
    </div>`;
  }).join('');

  scroll.querySelectorAll('.q-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) { selectItem(card.dataset.id); return; }
      e.stopPropagation();
      if (btn.dataset.action === 'delete') deleteItem(btn.dataset.id);
      if (btn.dataset.action === 'retry')  retryItem(btn.dataset.id);
    });
  });
}

export function selectItem(itemId) {
  state.currentItemId = itemId;
  const item = state.queueData[itemId];
  if (!item) return;
  renderQueue();
  if ((item.status === 'review' || item.status === 'done') && item.scrape_result) {
    if (_openDetailView) _openDetailView(itemId);
  }
}

export function updateQueueItemStatus(itemId, status) {
  const id = itemId || state.currentItemId;
  if (!state.queueData[id]) return;
  state.queueData[id].status = status;
  saveQueue();
  renderQueue();
}

// 소싱 후보에서 자동 큐 추가 (1688 URL 연결 완료 시 호출)
export async function addToQueueFromCandidate(candidate) {
  const { url1688, productName, thumbnailUrl, categoryId, id: candidateId } = candidate;
  if (!url1688) return;

  const itemId = 'item_' + Date.now();
  state.queueData[itemId] = {
    id: itemId, url: url1688, status: 'scraping',
    title_kr: productName || '', thumb: thumbnailUrl || null,
    logs: [], ts: Date.now(), candidateId,
    ...(categoryId ? { categoryId } : {}),
  };
  await saveQueue();
  renderQueue();
  state.currentItemId = itemId;
  renderQueue();
  appendGlobalLog(`소싱 후보 크롤링 시작: ${productName || url1688}`);

  chrome.runtime.sendMessage({ type: 'SCRAPE_REQUEST', url: url1688, itemId }, (resp) => {
    if (!resp?.ok) {
      appendGlobalLog('❌ 스크래핑 요청 실패: ' + (resp?.error || ''));
      updateQueueItemStatus(itemId, 'error');
    }
  });
}

export async function addToQueue() {
  const input = $('queue-url');
  const url = input.value.trim();
  if (!url || !url.includes('1688.com')) {
    alert('1688 상품 URL을 입력해주세요');
    return;
  }

  const itemId = 'item_' + Date.now();
  state.queueData[itemId] = {
    id: itemId, url, status: 'scraping',
    title_kr: '', thumb: null, logs: [], ts: Date.now(),
  };
  await saveQueue();
  renderQueue();
  input.value = '';

  state.currentItemId = itemId;
  renderQueue();
  appendGlobalLog('크롤링 시작...');

  chrome.runtime.sendMessage({ type: 'SCRAPE_REQUEST', url, itemId }, (resp) => {
    if (!resp?.ok) {
      appendGlobalLog('❌ 스크래핑 요청 실패: ' + (resp?.error || ''));
      updateQueueItemStatus(itemId, 'error');
    }
  });
}

export async function deleteItem(itemId) {
  if (state.isModalOpen && state.currentModalItemId === itemId) {
    if (_closeDetailView) _closeDetailView();
  }
  if (state.currentItemId === itemId) state.currentItemId = null;
  delete state.queueData[itemId];
  await saveQueue();
  renderQueue();
}

export async function retryItem(itemId) {
  const item = state.queueData[itemId];
  if (!item) return;
  state.queueData[itemId] = { ...item, status: 'scraping', scrape_result: undefined, thumb: null };
  if (state.isModalOpen && state.currentModalItemId === itemId) {
    if (_closeDetailView) _closeDetailView();
  }
  state.currentItemId = itemId;
  await saveQueue();
  renderQueue();
  appendGlobalLog(`재시도: ${item.title_kr || item.url}`);
  chrome.runtime.sendMessage({ type: 'SCRAPE_REQUEST', url: item.url, itemId }, (resp) => {
    if (!resp?.ok) {
      appendGlobalLog('❌ 스크래핑 요청 실패: ' + (resp?.error || ''));
      updateQueueItemStatus(itemId, 'error');
    }
  });
}

export async function clearDoneItems() {
  const doneIds = Object.keys(state.queueData).filter(id => state.queueData[id].status === 'done');
  if (!doneIds.length) { showToast('완료된 항목이 없어요'); return; }
  doneIds.forEach(id => {
    if (state.isModalOpen && state.currentModalItemId === id) {
      if (_closeDetailView) _closeDetailView();
    }
    if (state.currentItemId === id) state.currentItemId = null;
    delete state.queueData[id];
  });
  await saveQueue();
  renderQueue();
  showToast(`${doneIds.length}개 항목 삭제됨`);
}

export async function clearAllItems() {
  if (!Object.keys(state.queueData).length) { showToast('대기열이 비어있어요'); return; }
  if (!confirm('대기열을 전체 삭제할까요?')) return;
  if (state.isModalOpen && _closeDetailView) _closeDetailView();
  state.currentItemId = null;
  state.queueData = {};
  await saveQueue();
  renderQueue();
}

export function saveQueue() {
  return new Promise(resolve => chrome.storage.local.set({ queue: state.queueData }, resolve));
}

export function loadQueue() {
  chrome.storage.local.get('queue', ({ queue }) => {
    if (queue) {
      state.queueData = queue;
      renderQueue();
    }
  });
}
