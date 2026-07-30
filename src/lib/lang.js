// src/lib/lang.js
// 语言检测（纯函数，UMD：浏览器挂到 globalThis.WT，Node 下 module.exports）
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.WT = Object.assign(root.WT || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 语言检测（改进版：统计汉字 / 英文字母 / 其他 比例）
  // 返回 { source, target }
  function detectLang(text) {
    let cjk = 0;
    let latin = 0;
    let other = 0;

    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if (
        (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一汉字
        (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
        (code >= 0xf900 && code <= 0xfaff)    // CJK 兼容汉字
      ) {
        cjk++;
      } else if (
        (code >= 0x0041 && code <= 0x005a) || // A-Z
        (code >= 0x0061 && code <= 0x007a)    // a-z
      ) {
        latin++;
      } else {
        other++;
      }
    }

    const total = cjk + latin + other || 1;

    // 汉字占比 > 20% → 判定为中文
    if (cjk / total > 0.2) return { source: 'zh-CN', target: 'en' };
    // 否则按英文处理
    if (latin / total > 0.2) return { source: 'en', target: 'zh-CN' };
    // 无法判定，默认英→中
    return { source: 'en', target: 'zh-CN' };
  }

  // 简化语言代码检测（供 MyMemory 使用），返回 'zh-CN' | 'en'
  function detectLangCode(text) {
    let cjk = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) {
        cjk++;
      }
    }
    return cjk > 0 ? 'zh-CN' : 'en';
  }

  return { detectLang, detectLangCode };
});
