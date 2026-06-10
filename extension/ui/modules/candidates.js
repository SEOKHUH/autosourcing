// 소싱 후보 패널: 쿠팡에서 "+" 로 추가된 후보 카드 렌더링 + 1688 연결 관리

import { state } from './state.js';
import { $, esc, appendGlobalLog } from './utils.js';
import { extractCoupangData } from './mobile-sync.js';

let _addToQueueFromCandidate = null;

export function initCandidates({ addToQueueFromCandidate }) {
  _addToQueueFromCandidate = addToQueueFromCandidate;

  chrome.storage.local.get('sourcingCandidates', ({ sourcingCandidates }) => {
    state.sourcingCandidates = sourcingCandidates || [];
    renderCandidates();
  });
}

export function renderCandidates() {
  const list = $('candidates-list');
  const visible = state.sourcingCandidates.filter(c => c.status !== 'queued');
  const badgeEl = $('badge-candidates');
  if (badgeEl) badgeEl.textContent = visible.length;

  if (!visible.length) {
    list.innerHTML = '<div class="cand-empty">쿠팡에서 "+ 소싱" 버튼으로 후보를 추가하세요</div>';
    return;
  }

  list.innerHTML = visible.map(c => {
    const isLinked = c.status === 'linked';
    const hasLink = !!c.coupangUrl;
    const thumbHtml = c.thumbnailUrl
      ? `<img class="cand-thumb${hasLink ? ' cand-clickable' : ''}" src="${esc(c.thumbnailUrl)}" alt="" referrerpolicy="no-referrer" data-action="open-coupang" data-id="${esc(c.id)}">`
      : `<div class="cand-thumb-ph${hasLink ? ' cand-clickable' : ''}" data-action="open-coupang" data-id="${esc(c.id)}"></div>`;
    const priceHtml = c.price ? `<span class="cand-price">${c.price.toLocaleString()}원</span>` : '<span class="cand-price"></span>';
    const salesHtml = c.estimatedMonthlySales > 0 ? `<span class="cand-sales">월 ${c.estimatedMonthlySales.toLocaleString()}개</span>` : '<span class="cand-sales"></span>';
    const isFailed = c.source === 'mobile' && !c.thumbnailUrl && !c.price;
    return `<div class="cand-card ${isLinked ? 'cand-linked' : 'cand-pending'}" data-id="${esc(c.id)}">
      ${thumbHtml}
      <div class="cand-name${hasLink ? ' cand-clickable' : ''}" data-action="open-coupang" data-id="${esc(c.id)}">${esc(c.productName || '상품명 없음')}</div>
      ${priceHtml}
      ${salesHtml}
      <div class="cand-actions">
        ${isFailed ? `<button class="btn-sm btn-ghost cand-retry-btn" data-id="${esc(c.id)}">↺ 재시도</button>` : ''}
        ${isLinked ? `
          <button class="btn-sm btn-ghost cand-1688-btn" data-url="${esc(c.url1688 || '')}" ${c.url1688 ? '' : 'disabled'}>1688 보기</button>
          <button class="btn-sm btn-primary cand-scrape-btn" data-id="${esc(c.id)}">크롤링 시작</button>
        ` : `
          <div class="cand-manual-row" id="cand-manual-${esc(c.id)}" style="display:none">
            <input class="cand-url-input" data-id="${esc(c.id)}" placeholder="1688 URL 직접 입력" />
            <button class="btn-sm btn-primary cand-url-submit" data-id="${esc(c.id)}">연결</button>
          </div>
          <button class="btn-sm btn-ghost cand-manual-btn" data-id="${esc(c.id)}">직접 입력</button>
        `}
        <button class="cand-del-btn" data-action="delete" data-id="${esc(c.id)}" title="삭제">×</button>
      </div>
    </div>`;
  }).join('');

  // 재시도 버튼 (모바일 후보 데이터 추출 실패 시)
  list.querySelectorAll('.cand-retry-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const candidate = state.sourcingCandidates.find(c => c.id === btn.dataset.id);
      if (!candidate?.coupangUrl) return;
      btn.disabled = true;
      btn.textContent = '⏳';
      const meta = await extractCoupangData(candidate.coupangUrl).catch(() => ({}));
      const idx = state.sourcingCandidates.findIndex(c => c.id === candidate.id);
      if (idx !== -1) {
        state.sourcingCandidates[idx] = {
          ...candidate,
          productName: meta.productName || candidate.productName,
          price: meta.price || candidate.price || null,
          thumbnailUrl: meta.thumbnailUrl || candidate.thumbnailUrl || null,
          categoryId: meta.categoryId || candidate.categoryId || null,
          estimatedMonthlySales: meta.estimatedMonthlySales || candidate.estimatedMonthlySales || 0,
        };
        chrome.storage.local.set({ sourcingCandidates: state.sourcingCandidates });
        renderCandidates();
      }
    });
  });

  // 쿠팡 이동 (썸네일 + 상품명 클릭)
  list.querySelectorAll('[data-action="open-coupang"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const candidate = state.sourcingCandidates.find(c => c.id === el.dataset.id);
      if (candidate?.coupangUrl) window.open(candidate.coupangUrl, '_blank');
    });
  });

  // 삭제 버튼
  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCandidate(btn.dataset.id);
    });
  });

  // 직접 입력 버튼 토글
  list.querySelectorAll('.cand-manual-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(`cand-manual-${btn.dataset.id}`);
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    });
  });

  // 크롤링 시작 버튼 (연결된 후보에만 표시)
  list.querySelectorAll('.cand-scrape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const candidate = state.sourcingCandidates.find(c => c.id === btn.dataset.id);
      if (!candidate) return;

      // 로직 방어: 이미 큐에 있으면 중단
      const alreadyQueued = Object.values(state.queueData).some(
        q => q.candidateId === candidate.id &&
             (q.status === 'scraping' || q.status === 'review' || q.status === 'done')
      );
      if (alreadyQueued) return;

      // 후보 상태 → 'queued' (소싱 후보 탭에서 숨김)
      const idx = state.sourcingCandidates.findIndex(c => c.id === candidate.id);
      if (idx !== -1) state.sourcingCandidates[idx].status = 'queued';
      chrome.storage.local.set({ sourcingCandidates: state.sourcingCandidates });
      renderCandidates();

      if (_addToQueueFromCandidate) _addToQueueFromCandidate(candidate);
    });
  });

  // 1688 보기 버튼
  list.querySelectorAll('.cand-1688-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.url) window.open(btn.dataset.url, '_blank');
    });
  });

  // 직접 입력 → 연결
  list.querySelectorAll('.cand-url-submit').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = list.querySelector(`.cand-url-input[data-id="${btn.dataset.id}"]`);
      const url = input?.value?.trim();
      if (!url || !url.includes('1688.com')) { alert('1688 URL을 입력해주세요'); return; }
      btn.disabled = true;
      btn.textContent = '연결 중...';
      chrome.runtime.sendMessage(
        { type: 'LINK_1688_TO_CANDIDATE', candidateId: btn.dataset.id, url },
        (resp) => {
          if (!resp?.ok) {
            btn.disabled = false;
            btn.textContent = '연결';
            alert('연결 실패');
          }
        }
      );
    });
  });
}

export function onCandidateAdded(candidate) {
  state.sourcingCandidates.push(candidate);
  renderCandidates();
  appendGlobalLog(`소싱 후보 추가됨: ${candidate.productName || candidate.id}`);
}

export function onCandidateLinked(candidate) {
  const idx = state.sourcingCandidates.findIndex(c => c.id === candidate.id);
  if (idx !== -1) state.sourcingCandidates[idx] = candidate;
  else state.sourcingCandidates.push(candidate);
  renderCandidates();
  appendGlobalLog(`1688 연결됨: ${candidate.productName || candidate.id}`);
}

export function onCandidateRemoved(candidateId) {
  state.sourcingCandidates = state.sourcingCandidates.filter(c => c.id !== candidateId);
  renderCandidates();
}

function removeCandidate(candidateId) {
  chrome.runtime.sendMessage({ type: 'REMOVE_SOURCING_CANDIDATE', candidateId }, () => {
    onCandidateRemoved(candidateId);
  });
}

export function clearAllCandidates() {
  if (!state.sourcingCandidates.length) return;
  if (!confirm('소싱 후보를 전체 삭제할까요?')) return;
  const ids = state.sourcingCandidates.map(c => c.id);
  ids.forEach(id => chrome.runtime.sendMessage({ type: 'REMOVE_SOURCING_CANDIDATE', candidateId: id }));
  state.sourcingCandidates = [];
  chrome.storage.local.set({ sourcingCandidates: [] });
  renderCandidates();
}
