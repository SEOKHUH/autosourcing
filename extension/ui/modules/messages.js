// SW → UI 메시지 핸들러
// onScrapeDone, updateQueueItemStatus는 순환 의존 방지를 위해 콜백으로 주입

import { $, appendGlobalLog } from './utils.js';
import { state } from './state.js';

let _onScrapeDone = null;
let _updateStatus = null;

export function initMessageHandler({ onScrapeDone, updateQueueItemStatus }) {
  _onScrapeDone = onScrapeDone;
  _updateStatus = updateQueueItemStatus;
  chrome.runtime.onMessage.addListener(handleSwMessage);
}

function handleSwMessage(msg) {
  switch (msg.type) {
    case 'SCRAPE_LOG':
      appendGlobalLog(msg.text);
      break;
    case 'SCRAPE_DONE':
      if (_onScrapeDone) _onScrapeDone(msg.result);
      break;
    case 'SCRAPE_ERROR':
      appendGlobalLog('❌ 크롤링 오류: ' + msg.error);
      if (_updateStatus) _updateStatus(state.currentItemId, 'error');
      break;
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
  }
}
