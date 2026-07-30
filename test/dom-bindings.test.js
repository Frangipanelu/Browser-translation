// 静态回归测试：wordbook.js 引用的 DOM id 必须与 wordbook.html 一致，
// 防止「引用不存在的 id 导致 init() 抛错、整页功能瘫痪」这类 bug 复发。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'wordbook.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'wordbook.js'), 'utf8');

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
// 运行时由 JS 动态创建（showSyncBanner 内）或代码中已做 null 判空的可选元素，
// 不在 HTML 中但合法，不应计入缺失。
const allowedMissing = new Set([
  'wb-sync-banner', 'wb-sync-now-btn', 'wb-sync-dismiss', // 动态创建
  'wb-hint-mode' // onModeChange 中已 if(hintMode) 判空，可选
]);

test('wordbook.html 必须包含设置写入方式元素 id="wb-set-mechanism"', () => {
  assert.ok(htmlIds.has('wb-set-mechanism'), '缺少 wb-set-mechanism');
});

test('wordbook.js 不应再引用不存在的 wb-set-mode', () => {
  assert.ok(!js.includes('wb-set-mode'), '仍存在已废弃的 wb-set-mode 引用');
});

test('wordbook.js 所有 getElementById 的 id 必须存在于 HTML（动态创建的除外）', () => {
  const jsIds = [...new Set(
    [...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1])
  )];
  const missing = jsIds.filter((id) => !htmlIds.has(id) && !allowedMissing.has(id));
  assert.deepStrictEqual(missing, [], '缺失的元素 id: ' + missing.join(', '));
});
