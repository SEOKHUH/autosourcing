// 소싱 후보 패널: 쿠팡에서 "+" 로 추가된 후보 카드 렌더링 + 1688 연결 관리

import { state } from './state.js';
import { $, esc, appendGlobalLog } from './utils.js';

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
    const statusText = isLinked ? '✓ 연결됨' : '대기중';
    const thumbHtml = c.thumbnailUrl
      ? `<img class="cand-thumb" src="${esc(c.thumbnailUrl)}" alt="" referrerpolicy="no-referrer">`
      : '<div class="cand-thumb-ph"></div>';
    return `<div class="cand-card ${isLinked ? 'cand-linked' : 'cand-pending'}" data-id="${esc(c.id)}">
      ${thumbHtml}
      <div class="cand-body">
        <div class="cand-name">${esc(c.productName || '상품명 없음')}</div>
        <div class="cand-meta">
          ${c.price ? `<span>${c.price.toLocaleString()}원</span>` : ''}
          <span class="cand-status-badge ${isLinked ? 'cand-status-linked' : ''}">${statusText}</span>
        </div>
      </div>
      <div class="cand-actions">
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
