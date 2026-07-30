// src/lib/translate.js
// 多引擎翻译 + 自动降级（纯逻辑，UMD）
// 所有函数接受可选的 fetchFn 参数（默认 globalThis.fetch），便于在 Node 中注入假 fetch 做测试
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.WT = Object.assign(root.WT || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
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

  // Google 翻译免费接口 — sl 始终用 auto 让 Google 自动检测语言
  async function translateGoogle(texts, targetLang, fetchFn) {
    const fetch = fetchFn || globalThis.fetch;
    const results = {};
    const batchSize = 5;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const promises = batch.map(async (text) => {
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          const translated = data[0]
            .filter((x) => x[0])
            .map((x) => x[0])
            .join('');
          results[text] = translated || text;
        } catch (e) {
          results[text] = null;
        }
      });
      await Promise.all(promises);
      if (i + batchSize < texts.length) await sleep(100);
    }
    return results;
  }

  // MyMemory 翻译 — 免费备用，无需 API Key（每月 5000 词）
  async function translateMyMemory(texts, targetLang, fetchFn) {
    const fetch = fetchFn || globalThis.fetch;
    const results = {};
    const mmTarget = targetLang.startsWith('zh') ? 'zh-CN' : targetLang;

    for (const text of texts) {
      try {
        const detectedSource = detectLangCode(text);
        const pair = `${detectedSource}|${mmTarget}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (data.responseStatus === 200 || data.responseData) {
          results[text] = data.responseData?.translatedText || null;
        } else {
          results[text] = null;
        }
      } catch (e) {
        results[text] = null;
      }
    }
    return results;
  }

  // DeepL 翻译（需 API Key）
  async function translateDeepL(texts, targetLang, apiKey, fetchFn) {
    const fetch = fetchFn || globalThis.fetch;
    const results = {};
    const deeplLang = targetLang.startsWith('zh') ? 'ZH' : targetLang.toUpperCase();

    for (const text of texts) {
      try {
        const resp = await fetch('https://api-free.deepl.com/v2/translate', {
          method: 'POST',
          headers: {
            Authorization: `DeepL-Auth-Key ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: [text], target_lang: deeplLang }),
          signal: AbortSignal.timeout(10000)
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        results[text] = data.translations?.[0]?.text || null;
      } catch (e) {
        results[text] = null;
      }
    }
    return results;
  }

  // 多引擎翻译编排：主引擎失败自动切换备用引擎
  async function handleTranslation(msg, fetchFn) {
    const { texts, engine, targetLang, apiKey } = msg;

    if (engine === 'deepl' && apiKey) {
      const deeplResult = await translateDeepL(texts, targetLang, apiKey, fetchFn);
      // 检查是否全部成功
      if (texts.every((t) => deeplResult[t])) {
        return { results: deeplResult, engine: 'deepl' };
      }
      // DeepL 部分失败，尝试 Google 作为备用
      console.warn('[WT] DeepL partial failure, trying Google fallback');
    }

    // 主引擎：Google
    const googleResult = await translateGoogle(texts, targetLang, fetchFn);

    // 检查 Google 结果是否全部成功
    const googleFailed = texts.some((t) => !googleResult[t]);

    if (!googleFailed) {
      return { results: googleResult, engine: 'google' };
    }

    // Google 部分或全部失败 → 尝试 MyMemory 备用
    console.warn('[WT] Google translate failed for some texts, trying MyMemory fallback');
    const mmResult = await translateMyMemory(texts, targetLang, fetchFn);

    // 合并结果：Google 优先，MyMemory 补充
    const merged = {};
    for (const text of texts) {
      merged[text] = googleResult[text] || mmResult[text] || null;
    }

    // 如果仍然有失败的项
    const stillFailed = texts.filter((t) => !merged[t]);
    if (stillFailed.length) {
      return {
        results: merged,
        engine: 'fallback',
        warning: stillFailed.length === texts.length
          ? '所有翻译引擎均不可用，请检查网络连接或 VPN 状态'
          : `${stillFailed.length} 条翻译失败（网络可能不稳定）`
      };
    }

    return { results: merged, engine: 'mymemory' };
  }

  return { sleep, detectLangCode, translateGoogle, translateMyMemory, translateDeepL, handleTranslation };
});
