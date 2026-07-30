// 测试原句语境截取逻辑（src/lib/context.js）
const { test } = require('node:test');
const assert = require('node:assert');
const { extractSentence } = require('../src/lib/context.js');

test('截取选中单词所在的英文句子', () => {
  const text = 'Hello world. This is a test. Another sentence.';
  const start = text.indexOf('This');
  const end = start + 'This'.length;
  assert.strictEqual(extractSentence(text, start, end), 'This is a test.');
});

test('截取选中词所在的中文句子', () => {
  const text = '这是第一句。这是第二句，包含关键词。这是第三句。';
  const start = text.indexOf('关键词');
  const end = start + '关键词'.length;
  assert.strictEqual(extractSentence(text, start, end), '这是第二句，包含关键词。');
});

test('空串或非法偏移返回空串', () => {
  assert.strictEqual(extractSentence('', 0, 0), '');
  assert.strictEqual(extractSentence('abc', -1, 2), '');
});

test('超长句子截断到 300 字并加省略号', () => {
  const longText = 'Start. ' + 'x'.repeat(500) + '. End.';
  const start = longText.indexOf('x');
  const end = start + 5;
  const result = extractSentence(longText, start, end);
  assert.ok(result.length <= 303, '应被截断');
  assert.ok(result.endsWith('…'), '应以省略号结尾');
});
