// 测试语言检测逻辑（src/lib/lang.js）
const { test } = require('node:test');
const assert = require('node:assert');
const { detectLang, detectLangCode } = require('../src/lib/lang.js');

test('detectLang: 纯中文 → 源语言 zh-CN', () => {
  assert.deepStrictEqual(detectLang('你好世界'), { source: 'zh-CN', target: 'en' });
});

test('detectLang: 纯英文 → 源语言 en', () => {
  assert.deepStrictEqual(detectLang('hello world'), { source: 'en', target: 'zh-CN' });
});

test('detectLang: 中文占比 >20% 判定为中文', () => {
  // 4 个汉字 + 5 个字母 + 1 空格 = 10，汉字占比 0.4
  assert.deepStrictEqual(detectLang('你好世界 hello'), { source: 'zh-CN', target: 'en' });
});

test('detectLang: 单字母判定为英文', () => {
  assert.deepStrictEqual(detectLang('a'), { source: 'en', target: 'zh-CN' });
});

test('detectLangCode: 中文→zh-CN，英文→en', () => {
  assert.strictEqual(detectLangCode('你好'), 'zh-CN');
  assert.strictEqual(detectLangCode('hello'), 'en');
});
