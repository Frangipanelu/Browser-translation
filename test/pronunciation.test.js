// 发音功能回归测试
// 背景：v1.0 的划词发音在重构到 v2.0 时被丢失过一次，且 v2.0 虽然取到了
// 词典的真人发音音频（audioUrl）却从未播放。这里用静态断言锁住这条链路，
// 防止再次静默退化。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contentJs = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const wordbookJs = fs.readFileSync(path.join(root, 'wordbook.js'), 'utf8');
const wordbookCss = fs.readFileSync(path.join(root, 'wordbook.css'), 'utf8');

test('content.js 气泡中必须有发音按钮 wt-btn-speaker', () => {
  assert.ok(
    contentJs.includes('wt-btn-speaker'),
    '缺少发音按钮 wt-btn-speaker，划词气泡将无法播放发音'
  );
});

test('发音按钮应对英文原文常驻显示，不能只依赖词典接口返回成功', () => {
  // 历史 bug：按钮仅在词典查询成功后才 display=''，接口一失败按钮就永不出现
  assert.match(
    contentJs,
    /lang\.source === 'en'[\s\S]{0,80}speakerBtn\.style\.display = ''/,
    '发音按钮未在英文原文时直接显示，仍被词典接口成败卡住'
  );
});

test('playTts 必须优先播放真人发音音频，并在失败时回退系统 TTS', () => {
  assert.match(
    contentJs,
    /function playTts\([^)]*audioUrl/,
    'playTts 未接收 audioUrl 参数，真人发音音频不会生效'
  );
  assert.match(
    contentJs,
    /new Audio\(audioUrl\)/,
    'playTts 未使用 Audio 播放真人发音音频'
  );
  assert.match(
    contentJs,
    /speakWithTts/,
    'playTts 缺少系统 TTS 回退实现'
  );
});

test('单词本必须提供发音入口 speakWord 与 wb-pron-btn', () => {
  assert.match(wordbookJs, /function speakWord\(/, 'wordbook.js 缺少 speakWord 函数');
  assert.ok(wordbookJs.includes('wb-pron-btn'), 'wordbook.js 词条卡片缺少发音按钮');
  assert.match(
    wordbookJs,
    /querySelectorAll\('\.wb-pron-btn'\)/,
    'wordbook.js 未给发音按钮绑定点击事件'
  );
});

test('单词本发音按钮必须有样式定义', () => {
  assert.match(wordbookCss, /\.wb-pron-btn\s*\{/, 'wordbook.css 缺少 .wb-pron-btn 样式');
});
