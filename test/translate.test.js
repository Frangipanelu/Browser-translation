// 测试多引擎翻译与自动降级（src/lib/translate.js）
// 通过注入假 fetch 验证逻辑，无需真实网络
const { test } = require('node:test');
const assert = require('node:assert');
const { translateGoogle, translateMyMemory, handleTranslation } = require('../src/lib/translate.js');

// 根据 URL 关键字返回不同响应的假 fetch
function makeFetch(map) {
  return async (url) => {
    for (const [matcher, responder] of map) {
      if (url.includes(matcher)) {
        const body = typeof responder === 'function' ? responder(url) : responder;
        return { ok: true, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

const GOOGLE_RESP = [[['你好', 'hello']]];

test('translateGoogle: 正确解析 Google 响应', async () => {
  const fetchFn = makeFetch([['googleapis', GOOGLE_RESP]]);
  const res = await translateGoogle(['hello'], 'zh-CN', fetchFn);
  assert.strictEqual(res.hello, '你好');
});

test('translateGoogle: 请求失败返回 null（不抛异常）', async () => {
  const fetchFn = async () => { throw new Error('net down'); };
  const res = await translateGoogle(['hello'], 'zh-CN', fetchFn);
  assert.strictEqual(res.hello, null);
});

test('translateMyMemory: 正确解析响应', async () => {
  const fetchFn = makeFetch([['mymemory', { responseStatus: 200, responseData: { translatedText: '你好' } }]]);
  const res = await translateMyMemory(['hello'], 'zh-CN', fetchFn);
  assert.strictEqual(res.hello, '你好');
});

test('handleTranslation: Google 成功则直接用', async () => {
  const fetchFn = makeFetch([['googleapis', GOOGLE_RESP]]);
  const r = await handleTranslation({ texts: ['hello'], engine: 'google', targetLang: 'zh-CN' }, fetchFn);
  assert.strictEqual(r.engine, 'google');
  assert.strictEqual(r.results.hello, '你好');
});

test('handleTranslation: Google 失败后自动降级 MyMemory', async () => {
  let googleCalls = 0;
  const fetchFn = async (url) => {
    if (url.includes('googleapis')) {
      googleCalls++;
      throw new Error('blocked');
    }
    return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: '你好' } }) };
  };
  const r = await handleTranslation({ texts: ['hello'], engine: 'google', targetLang: 'zh-CN' }, fetchFn);
  assert.strictEqual(r.engine, 'mymemory');
  assert.strictEqual(r.results.hello, '你好');
  assert.strictEqual(googleCalls, 1);
});

test('handleTranslation: 全部引擎失败返回 warning', async () => {
  const fetchFn = async () => { throw new Error('down'); };
  const r = await handleTranslation({ texts: ['hello'], engine: 'google', targetLang: 'zh-CN' }, fetchFn);
  assert.strictEqual(r.engine, 'fallback');
  assert.ok(r.warning);
  assert.strictEqual(r.results.hello, null);
});
