// Tesseract.js 싱글톤 워커 — 중국어 OCR
// 최초 호출 시 1회만 워커를 생성하고, 이후엔 캐싱된 인스턴스를 반환.
// MV3 CSP에서는 blob: URL이 차단되므로 workerBlobURL:false 필수.

let workerPromise = null;

export function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('chi_sim', 1, {
      workerPath:    chrome.runtime.getURL('vendor/tesseract-worker.min.js'),
      corePath:      chrome.runtime.getURL('vendor/tesseract-core-lstm.wasm.js'),
      langPath:      chrome.runtime.getURL('vendor/tessdata'),
      workerBlobURL: false,
    }).catch(err => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}
