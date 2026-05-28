// 적응형 인페인팅 — 박스 영역을 주변 색상으로 채움
// 단색 / 세로 그라데이션 / 가로 그라데이션 자동 분기

const SAMPLE_WIDTH = 2;
const GRADIENT_THRESHOLD = 20;

function avgColor(ctx, x, y, w, h) {
  if (w <= 0 || h <= 0) return null;
  const img = ctx.getImageData(x, y, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < img.length; i += 4) {
    r += img[i]; g += img[i + 1]; b += img[i + 2];
    n++;
  }
  if (n === 0) return null;
  return { r: r / n, g: g / n, b: b / n };
}

function rgbDist(a, b) {
  if (!a || !b) return 0;
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function rgbStr(c) {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}

function avgOfColors(colors) {
  const valid = colors.filter(c => c);
  if (!valid.length) return { r: 255, g: 255, b: 255 };
  return {
    r: valid.reduce((s, c) => s + c.r, 0) / valid.length,
    g: valid.reduce((s, c) => s + c.g, 0) / valid.length,
    b: valid.reduce((s, c) => s + c.b, 0) / valid.length,
  };
}

export function fillBox(ctx, box, canvasW, canvasH) {
  const { x, y, w, h } = box;
  const sw = SAMPLE_WIDTH;

  // 경계 Clamping — 이미지 가장자리에 박스가 붙어있을 때 범위 초과 방지
  const topY    = Math.max(0, y - sw);
  const topH    = Math.max(0, y - topY);
  const botY    = Math.min(canvasH, y + h);
  const botH    = Math.min(canvasH, y + h + sw) - botY;
  const leftX   = Math.max(0, x - sw);
  const leftW   = Math.max(0, x - leftX);
  const rightX  = Math.min(canvasW, x + w);
  const rightW  = Math.min(canvasW, x + w + sw) - rightX;

  const sampleX = Math.max(0, Math.min(canvasW - 1, x));
  const sampleW = Math.min(canvasW - sampleX, w);
  const sampleY = Math.max(0, Math.min(canvasH - 1, y));
  const sampleH = Math.min(canvasH - sampleY, h);

  if (sampleW <= 0 || sampleH <= 0) return;

  const topRgb    = topH    > 0 ? avgColor(ctx, sampleX, topY,   sampleW, topH)   : null;
  const botRgb    = botH    > 0 ? avgColor(ctx, sampleX, botY,   sampleW, botH)   : null;
  const leftRgb   = leftW   > 0 ? avgColor(ctx, leftX,   sampleY, leftW,  sampleH) : null;
  const rightRgb  = rightW  > 0 ? avgColor(ctx, rightX,  sampleY, rightW, sampleH) : null;

  const diffV = rgbDist(topRgb, botRgb);
  const diffH = rgbDist(leftRgb, rightRgb);

  if (Math.max(diffV, diffH) < GRADIENT_THRESHOLD) {
    // 단색 채우기 — 4방향 평균색
    const c = avgOfColors([topRgb, botRgb, leftRgb, rightRgb]);
    ctx.fillStyle = rgbStr(c);
    ctx.fillRect(x, y, w, h);
  } else if (diffV >= diffH) {
    // 세로 그라데이션
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, rgbStr(topRgb || botRgb || { r: 255, g: 255, b: 255 }));
    grad.addColorStop(1, rgbStr(botRgb || topRgb || { r: 255, g: 255, b: 255 }));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  } else {
    // 가로 그라데이션
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, rgbStr(leftRgb || rightRgb || { r: 255, g: 255, b: 255 }));
    grad.addColorStop(1, rgbStr(rightRgb || leftRgb || { r: 255, g: 255, b: 255 }));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }
}

export function fillBoxes(ctx, boxes, canvasW, canvasH) {
  for (const box of boxes) fillBox(ctx, box, canvasW, canvasH);
}
