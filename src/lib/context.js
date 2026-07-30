// src/lib/context.js
// 原句语境截取（纯函数，UMD）
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.WT = Object.assign(root.WT || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 从整段文本 + 选中起止偏移，截取包含选中文本的那一句
  // 这是纯函数：DOM 取值（节点文本、选区偏移）由调用方负责，这里只做文本计算，便于测试
  function extractSentence(fullText, start, end) {
    if (!fullText || typeof start !== 'number' || start < 0) return '';
    const boundary = /[.?!。！？…\n\r]/;

    // 向前找句子起点（句末标点之后）
    let s = start;
    while (s > 0 && !boundary.test(fullText[s - 1])) s--;

    // 向后找句子终点（含句末标点）
    let e = end;
    while (e < fullText.length && !boundary.test(fullText[e])) e++;
    if (e < fullText.length) e++;

    let sentence = fullText.slice(s, e).trim().replace(/\s+/g, ' ');
    if (sentence.length > 300) sentence = sentence.slice(0, 300) + '…';
    return sentence;
  }

  return { extractSentence };
});
