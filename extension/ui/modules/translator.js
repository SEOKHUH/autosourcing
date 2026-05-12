// 중국어 → 한국어 번역 (Google Translate 비공개 Web API)

export const Translator = (() => {
  const FILLER_WORDS = [
    '새로운', '최신', '고품질', '패션', '인기', '다기능', '다목적',
    '핫 세일', '무료 배송', '고급', '업그레이드', '트렌디', '창의적',
    '가정용', '대용량', '슈퍼', '특별한', '완벽한', '훌륭한',
    '간단한', '실용적인', '편리한', '휴대용', '경량', '내구성',
  ];

  async function translateToKorean(text) {
    if (!text || !text.trim()) return '';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const result = data[0].map(x => x[0]).join('');
        if (result && result !== text) return result;
      } catch (e) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 500));
      }
    }
    return text;
  }

  function cleanProductName(name) {
    if (!name) return name;
    name = name.replace(/^[A-Za-z0-9\s\-\.&]+\s+/, '').trim();
    if (!name) return name;
    for (const word of FILLER_WORDS) name = name.split(word).join('');
    const words = name.split(/\s+/);
    const seen = [];
    for (const w of words) {
      if (!seen.includes(w) || w.length <= 1) seen.push(w);
    }
    name = seen.join(' ').replace(/\s+/g, ' ').trim();
    if (name.length > 40) {
      const truncated = name.slice(0, 40);
      const lastSpace = truncated.lastIndexOf(' ');
      name = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
    }
    return name.trim();
  }

  async function translateBatch(texts) {
    return Promise.all(texts.map(t => translateToKorean(t)));
  }

  return { translateToKorean, cleanProductName, translateBatch };
})();
