// SW → UI 메시지 핸들러
// onScrapeDone, updateQueueItemStatus는 순환 의존 방지를 위해 콜백으로 주입

import { $, appendGlobalLog } from './utils.js';
import { state } from './state.js';
import { crawlSettled } from './queue.js';

let _onScrapeDone = null;
let _updateStatus = null;
let _onCandidateAdded = null;
let _onCandidateLinked = null;
let _onCandidateRemoved = null;

export function initMessageHandler({ onScrapeDone, updateQueueItemStatus, onCandidateAdded, onCandidateLinked, onCandidateRemoved }) {
  _onScrapeDone = onScrapeDone;
  _updateStatus = updateQueueItemStatus;
  _onCandidateAdded = onCandidateAdded;
  _onCandidateLinked = onCandidateLinked;
  _onCandidateRemoved = onCandidateRemoved;
  chrome.runtime.onMessage.addListener(handleSwMessage);
}

function handleSwMessage(msg) {
  switch (msg.type) {
    case 'SCRAPE_LOG':
      appendGlobalLog(msg.text);
      break;
    case 'SCRAPE_DONE':
      if (_onScrapeDone) _onScrapeDone(msg.result, msg.itemId);
      break;
    case 'SCRAPE_ERROR': {
      appendGlobalLog('❌ 크롤링 오류: ' + msg.error);
      const errId = msg.itemId || state.currentItemId;
      if (_updateStatus) _updateStatus(errId, 'error');
      crawlSettled(errId);
      break;
    }
    case 'REGISTER_LOG':
    case 'DRAFT_LOG':
      appendGlobalLog(msg.text);
      break;
    case 'REGISTER_DONE':
      $('register-done').classList.remove('hidden');
      if (_updateStatus) _updateStatus(state.currentItemId, 'done');
      break;
    case 'REGISTER_ERROR':
      appendGlobalLog('❌ 등록 오류: ' + msg.error);
      break;
    case 'CANDIDATE_ADDED':
      if (_onCandidateAdded) _onCandidateAdded(msg.candidate);
      break;
    case 'CANDIDATE_LINKED':
      if (_onCandidateLinked) _onCandidateLinked(msg.candidate);
      break;
    case 'CANDIDATE_REMOVED':
      if (_onCandidateRemoved) _onCandidateRemoved(msg.candidateId);
      break;
  }
}
