// 대기열 관리: 추가·렌더링·삭제·재시도·저장·로드

import { state } from './state.js';
import { $, esc, statusLabel, statusIcon, appendGlobalLog, showToast } from './utils.js';
import { renderCandidates } from './candidates.js';
import { IDB } from './idb.js';
import { buildLedgerRows } from './ledger.js';
import { pushLedgerToSheet } from './mobile-sync.js';

// 큐 항목 삭제 시 연결된 후보 정리: 진행 중/에러면 pending 복원, 완료면 제거
function releaseCandidate(candidateId, { remove = false } = {}) {
  if (!candidateId) return;
  const idx = state.sourcingCandidates.findIndex(c => c.id === candidateId);
  if (idx === -1) return;
  if (remove) state.sourcingCandidates.splice(idx, 1);
  else state.sourcingCandidates[idx].status = 'pending';
  chrome.storage.local.set({ sourcingCandidates: state.sourcingCandidates });
  renderCandidates();
}

// openDetailView, closeDetailView는 순환 의존 방지를 위해 콜백으로 주입
let _openDetailView  = null;
let _closeDetailView = null;

export function initQueue({ openDetailView, closeDetailView }) {
  _openDetailView  = openDetailView;
  _closeDetailView = closeDetailView;
}

// ── 순차 크롤링 스케줄러: 동시에 여러 개 눌러도 하나씩 처리 ──────────────────
const _crawlQueue = [];
let _activeItemId = null;

function scheduleCrawl(itemId, url) {
  // 중복 방지: 이미 진행 중이거나 대기열에 있으면 무시
  if (_activeItemId === itemId || _crawlQueue.some(c => c.itemId === itemId)) return;
  _crawlQueue.push({ itemId, url });
  pumpCrawl();
}

function pumpCrawl() {
  if (_activeItemId || !_crawlQueue.length) return;
  const { itemId, url } = _crawlQueue.shift();
  if (!state.queueData[itemId]) { pumpCrawl(); return; } // 삭제된 항목 건너뜀
  _activeItemId = itemId;
  state.currentItemId = itemId;
  renderQueue();
  chrome.runtime.sendMessage({ type: 'SCRAPE_REQUEST', url, itemId }, (resp) => {
    if (!resp?.ok) {
      appendGlobalLog('❌ 스크래핑 요청 실패: ' + (resp?.error || ''));
      updateQueueItemStatus(itemId, 'error');
      crawlSettled(itemId);
    }
  });
}

const CRAWL_THROTTLE_MS = 1800;

// 크롤링(성공/실패) 완료 시 호출 → 다음 항목 진행. 같은 itemId 중복 호출은 무시.
export function crawlSettled(itemId) {
  if (_activeItemId !== itemId) return;
  _activeItemId = null;
  setTimeout(pumpCrawl, CRAWL_THROTTLE_MS);
}

// 가격 0 감지 시 1회 자동 재크롤 — 중복 가드를 우회해 직접 큐에 삽입
export function enqueueRescrape(itemId, url) {
  _crawlQueue.unshift({ itemId, url }); // 맨 앞에 삽입(현재 settled 직후 바로 실행)
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
    const retryBtn = (item.status === 'error' || item.status === 'review' || item.priceMissing)
      ? `<button class="q-retry-btn" data-action="retry" data-id="${esc(item.id)}">↺ 재크롤링</button>`
      : '';
    const priceBadge = item.priceMissing
      ? `<span class="q-badge badge-price-warn">⚠ 가격 확인</span>`
      : '';
    const stepLabels = ['', '정보 검수 중', '이미지 크롭 중', '등록 준비 완료'];
    const progressBadge = (item.progress && item.status === 'review')
      ? `<span class="q-progress-badge">Step ${item.progress.step} · ${stepLabels[item.progress.step] || ''}</span>`
      : '';
    return `<div class="q-card ${active}" data-id="${esc(item.id)}">
      <button class="q-del-btn" data-action="delete" data-id="${esc(item.id)}" title="삭제">×</button>
      ${thumbHtml}
      <div class="q-card-body">
        <div class="q-name">${esc(item.title_kr || '크롤링 중...')}</div>
        ${progressBadge}
      </div>
      <div class="q-card-meta">
        <span class="q-badge badge-${esc(item.status)}">${badge}</span>
        ${priceBadge}
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
  const { url1688, productName, thumbnailUrl, categoryId, id: candidateId,
          coupangUrl, price, estimatedMonthlySales } = candidate;
  if (!url1688) return;

  const itemId = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  state.queueData[itemId] = {
    id: itemId, url: url1688, status: 'scraping',
    title_kr: productName || '', thumb: thumbnailUrl || null,
    logs: [], ts: Date.now(), candidateId,
    ...(categoryId            ? { categoryId }                             : {}),
    ...(coupangUrl            ? { coupangUrl }                             : {}),
    ...(coupangUrl && productName ? { coupangName: productName }           : {}),
    ...(price != null         ? { coupangPrice: price }                    : {}),
    ...(estimatedMonthlySales ? { estimatedMonthlySales }                  : {}),
    ...(thumbnailUrl          ? { coupangThumb: thumbnailUrl }             : {}),
  };
  await saveQueue();
  renderQueue();
  appendGlobalLog(`소싱 후보 크롤링 대기열 추가: ${productName || url1688}`);
  scheduleCrawl(itemId, url1688);
}

export async function addToQueue() {
  const input = $('queue-url');
  const url = input.value.trim();
  if (!url || !url.includes('1688.com')) {
    alert('1688 상품 URL을 입력해주세요');
    return;
  }

  const itemId = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  state.queueData[itemId] = {
    id: itemId, url, status: 'scraping',
    title_kr: '', thumb: null, logs: [], ts: Date.now(),
  };
  await saveQueue();
  renderQueue();
  input.value = '';

  appendGlobalLog('크롤링 대기열 추가...');
  scheduleCrawl(itemId, url);
}

export async function deleteItem(itemId) {
  const item = state.queueData[itemId];

  // 안전망: done이지만 시트 미전송인 경우 재전송 시도
  if (item?.status === 'done' && item.submittedToSheet !== true) {
    try {
      const rows = buildLedgerRows(item);
      const res  = await pushLedgerToSheet({ url1688: item.url, rows });
      if (!res.ok && !res.noWebhook) {
        showToast('❌ 시트 전송 실패 — URL 보존을 위해 항목을 삭제하지 않았어요');
        return;
      }
    } catch (e) {
      showToast('❌ 시트 전송 오류 — URL 보존을 위해 항목을 삭제하지 않았어요');
      return;
    }
  }

  if (state.isModalOpen && state.currentModalItemId === itemId) {
    if (_closeDetailView) _closeDetailView();
  }
  if (state.currentItemId === itemId) state.currentItemId = null;
  delete state.queueData[itemId];
  await saveQueue();
  renderQueue();
  if (item?.candidateId) releaseCandidate(item.candidateId, { remove: item.status === 'done' });
  if (itemId) IDB.clearItem(itemId).catch(() => {});
}

export async function retryItem(itemId) {
  const item = state.queueData[itemId];
  if (!item) return;
  state.queueData[itemId] = { ...item, status: 'scraping', scrape_result: undefined, thumb: null, priceMissing: undefined, _priceRetried: undefined };
  if (state.isModalOpen && state.currentModalItemId === itemId) {
    if (_closeDetailView) _closeDetailView();
  }
  await saveQueue();
  renderQueue();
  appendGlobalLog(`재시도: ${item.title_kr || item.url}`);
  scheduleCrawl(itemId, item.url);
}

export async function clearDoneItems() {
  const doneIds = Object.keys(state.queueData).filter(id => state.queueData[id].status === 'done');
  if (!doneIds.length) { showToast('완료된 항목이 없어요'); return; }

  // 안전망: 미전송 항목 재전송 시도
  const failed = [];
  for (const id of doneIds) {
    const item = state.queueData[id];
    if (item.submittedToSheet !== true) {
      try {
        const rows = buildLedgerRows(item);
        const res  = await pushLedgerToSheet({ url1688: item.url, rows });
        if (!res.ok && !res.noWebhook) { failed.push(id); continue; }
      } catch { failed.push(id); continue; }
    }
  }

  if (failed.length > 0) {
    showToast(`❌ ${failed.length}개 시트 전송 실패 — 해당 항목은 보존됨`);
  }

  const toDelete = doneIds.filter(id => !failed.includes(id));
  toDelete.forEach(id => {
    if (state.isModalOpen && state.currentModalItemId === id) {
      if (_closeDetailView) _closeDetailView();
    }
    if (state.currentItemId === id) state.currentItemId = null;
    const cid = state.queueData[id]?.candidateId;
    delete state.queueData[id];
    if (cid) releaseCandidate(cid, { remove: true });
    IDB.clearItem(id).catch(() => {});
  });
  if (toDelete.length > 0) {
    await saveQueue();
    renderQueue();
    showToast(`${toDelete.length}개 항목 삭제됨`);
  }
}

export async function clearAllItems() {
  if (!Object.keys(state.queueData).length) { showToast('대기열이 비어있어요'); return; }
  if (!confirm('대기열을 전체 삭제할까요?')) return;

  // 안전망: done이지만 미전송인 항목 재전송 시도
  const doneUnsent = Object.values(state.queueData)
    .filter(item => item.status === 'done' && item.submittedToSheet !== true);
  const failed = [];
  for (const item of doneUnsent) {
    try {
      const rows = buildLedgerRows(item);
      const res  = await pushLedgerToSheet({ url1688: item.url, rows });
      if (!res.ok && !res.noWebhook) { failed.push(item.id); }
    } catch { failed.push(item.id); }
  }

  if (failed.length > 0) {
    showToast(`❌ ${failed.length}개 시트 전송 실패 — 해당 항목은 보존됨`);
  }

  if (state.isModalOpen && _closeDetailView) _closeDetailView();
  Object.values(state.queueData).forEach(item => {
    if (failed.includes(item.id)) return; // 전송 실패 항목은 보존
    if (item.candidateId) releaseCandidate(item.candidateId, { remove: item.status === 'done' });
    IDB.clearItem(item.id).catch(() => {});
    delete state.queueData[item.id];
  });
  state.currentItemId = null;
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
