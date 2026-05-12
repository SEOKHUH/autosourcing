// HTML 템플릿 + html2canvas 기반 라벨/상세페이지 이미지 생성
// html2canvas는 vendor/html2canvas.min.js에서 전역 로드됨

export const HtmlRenderer = (() => {
  function createHiddenIframe() {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:3400px;border:none;visibility:hidden;pointer-events:none;';
    document.body.appendChild(iframe);
    return iframe;
  }

  function loadIframe(iframe, html) {
    return new Promise((resolve) => {
      iframe.onload = () => resolve(iframe.contentDocument);
      iframe.srcdoc = html;
    });
  }

  function arrayBufferToDataUrl(buffer, mimeType = 'image/jpeg') {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  function arrayBufferToBlobUrl(buffer, mimeType = 'image/jpeg') {
    return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
  }

  function injectImageSlot(doc, selector, buffer) {
    const el = doc.querySelector(selector);
    if (!el || !buffer) return;
    const img = doc.createElement('img');
    img.src = arrayBufferToDataUrl(buffer);
    img.style.cssText = 'width:100%;height:auto;display:block;';
    el.innerHTML = '';
    el.appendChild(img);
  }

  async function captureElement(iframeDoc, selector, options = {}) {
    const el = iframeDoc.querySelector(selector);
    if (!el) throw new Error(`selector not found: ${selector}`);
    if (iframeDoc.fonts?.ready) await iframeDoc.fonts.ready;
    await new Promise(r => setTimeout(r, 400));
    const canvas = await window.html2canvas(el, {
      useCORS: false, allowTaint: true, foreignObjectRendering: true,
      scale: options.scale || 1, width: options.width, height: options.height,
      backgroundColor: '#ffffff', logging: false, ...options,
    });
    return canvas;
  }

  async function renderLabel({ productName, color, material, quantity }) {
    const templateUrl = chrome.runtime.getURL('static/label/index.html');
    const cssUrl      = chrome.runtime.getURL('static/label/style.css');
    const globalsUrl  = chrome.runtime.getURL('static/globals.css');
    const resp = await fetch(templateUrl);
    let html = await resp.text();
    html = html.replace('../globals.css', globalsUrl).replace('style.css', cssUrl);

    const iframe    = createHiddenIframe();
    const iframeDoc = await loadIframe(iframe, html);
    iframeDoc.querySelector('.name').textContent  = productName || '';
    iframeDoc.querySelector('.color').textContent = color || '';
    iframeDoc.querySelector('.mtl').textContent   = material || '';
    iframeDoc.querySelector('.count').textContent = quantity || '';

    const canvas = await captureElement(iframeDoc, '.element', { width: 1083, height: 600, scale: 1 });
    document.body.removeChild(iframe);
    return canvas.toDataURL('image/png');
  }

  async function renderDetailPage({ productName, color, quantity, material, imageBuffers }) {
    const templateUrl = chrome.runtime.getURL('static/detail_page/index.html');
    const cssUrl      = chrome.runtime.getURL('static/detail_page/style.css');
    const globalsUrl  = chrome.runtime.getURL('static/globals.css');
    const resp = await fetch(templateUrl);
    let html = await resp.text();
    html = html.replace('../globals.css', globalsUrl).replace('style.css', cssUrl);

    const iframe    = createHiddenIframe();
    const iframeDoc = await loadIframe(iframe, html);

    const set = (sel, val) => { const el = iframeDoc.querySelector(sel); if (el) el.textContent = val || ''; };
    set('.name', productName); set('.name-2', productName);
    set('.color', color); set('.count', quantity); set('.mtl', material);

    const imgSlots = ['.img', '.div', '.img-2'];
    if (imageBuffers?.length > 0) {
      imgSlots.forEach((sel, i) => { if (imageBuffers[i]) injectImageSlot(iframeDoc, sel, imageBuffers[i]); });
    }

    const allImgs = [...iframeDoc.querySelectorAll('img')];
    await Promise.all(allImgs.map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
    ));
    await new Promise(r => setTimeout(r, 100));
    const totalHeight = iframeDoc.querySelector('.element').scrollHeight;

    const canvas = await captureElement(iframeDoc, '.element', {
      width: 800, height: totalHeight, scale: 1, foreignObjectRendering: false,
    });
    document.body.removeChild(iframe);
    return canvas.toDataURL('image/png');
  }

  return { renderLabel, renderDetailPage, arrayBufferToBlobUrl };
})();
