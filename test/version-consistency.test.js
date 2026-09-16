// 静态回归测试：版本号必须全局一致。
// 背景：版本号曾多次漂移——manifest 已是 2.0，而 package.json 停在 2.1.1、
// 单词本 UI 写死 v2.1.6、文档写 v2.1.0，导致用户看到多个互相矛盾的版本。
// 本测试锁住「单一事实来源 = manifest.json 的 version」，防止再次不一致。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const wordbookHtml = read('wordbook.html');
const wordbookJs = read('wordbook.js');
const backgroundJs = read('background.js');

const MANIFEST_VERSION = manifest.version;

test('package.json 的 version 必须与 manifest.json 一致', () => {
  assert.strictEqual(
    pkg.version,
    MANIFEST_VERSION,
    `package.json 为 ${pkg.version}，manifest.json 为 ${MANIFEST_VERSION}，两者不一致`
  );
});

test('单词本 UI 的版本号必须由 manifest 动态注入，不再写死', () => {
  // 1) HTML 中必须存在版本占位元素
  assert.ok(
    /id="wb-version"/.test(wordbookHtml),
    'wordbook.html 缺少 id="wb-version" 版本展示元素'
  );
  // 2) JS 必须读取 manifest 版本并写回该元素（而非硬编码字符串）
  assert.ok(
    /getElementById\(['"]wb-version['"]\)/.test(wordbookJs),
    'wordbook.js 未获取 wb-version 元素'
  );
  assert.ok(
    /chrome\.runtime\.getManifest\(\)\.version/.test(wordbookJs),
    'wordbook.js 应从 chrome.runtime.getManifest().version 读取版本，避免 UI 与 manifest 漂移'
  );
});

test('background.js 的安装/更新日志版本号与 manifest 一致', () => {
  const logged = [...backgroundJs.matchAll(/划词翻译助手已(?:安装|更新到)\s*v?([\d.]+)/g)]
    .map((m) => m[1]);
  assert.ok(logged.length > 0, 'background.js 中未找到安装/更新日志');
  for (const v of logged) {
    assert.strictEqual(v, MANIFEST_VERSION, `日志中的版本 v${v} 与 manifest 的 ${MANIFEST_VERSION} 不一致`);
  }
});

test('单词本 UI 的静态兜底版本号与 manifest 一致', () => {
  // HTML 里的静态值是 JS 未执行时的兜底，也必须同步，否则会闪现旧版本
  const m = wordbookHtml.match(/id="wb-version"[^>]*>\s*v?([\d.]+)\s*</);
  assert.ok(m, '未能从 wordbook.html 解析出静态版本号');
  assert.strictEqual(m[1], MANIFEST_VERSION, `HTML 静态版本 ${m[1]} 与 manifest 的 ${MANIFEST_VERSION} 不一致`);
});

test('manifest 版本号符合 semver 且不含预发布后缀', () => {
  assert.match(MANIFEST_VERSION, /^\d+\.\d+(\.\d+)?$/, `manifest 版本号 ${MANIFEST_VERSION} 格式不合法`);
});
