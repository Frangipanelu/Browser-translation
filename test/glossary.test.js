// 测试术语表文件生成（src/lib/glossary.js）
const { test } = require('node:test');
const assert = require('node:assert');
const { sanitizeFilename, buildGlossaryContent } = require('../src/lib/glossary.js');

test('sanitizeFilename: 空格转连字符、去除非法字符', () => {
  assert.strictEqual(sanitizeFilename('hello world'), 'hello-world');
  assert.strictEqual(sanitizeFilename('a/b:c*?'), 'abc');
});

test('sanitizeFilename: 全空白或空串回退到 term', () => {
  assert.strictEqual(sanitizeFilename('   '), 'term');
  assert.strictEqual(sanitizeFilename(''), 'term');
});

test('buildGlossaryContent: 生成完整 frontmatter + 正文', () => {
  const term = {
    original: 'hello',
    translated: '你好',
    glossaryType: 'idiom',
    phonetic: 'həˈləʊ',
    definition: 'greeting',
    context: 'Hello world, this is a test.',
    source: 'https://example.com/a',
    sourceTitle: '示例',
    tags: ['glossary', '商务'],
    created: '2026-07-30'
  };
  const md = buildGlossaryContent(term);
  assert.match(md, /---\n/);
  assert.match(md, /term: "hello"/);
  assert.match(md, /translation: "你好"/);
  assert.match(md, /type: idiom/);
  assert.match(md, /phonetic: "həˈləʊ"/);
  assert.match(md, /definition: "greeting"/);
  assert.match(md, /context: "Hello world, this is a test."/);
  assert.match(md, /source: "https:\/\/example.com\/a"/);
  assert.match(md, /sourceTitle: "示例"/);
  assert.match(md, /tags: \["glossary", "商务"\]/);
  assert.match(md, /# hello/);
  assert.match(md, /\*\*你好\*\*/);
  assert.match(md, /> Hello world, this is a test./);
  assert.match(md, /- 类型：地道表达/);
  assert.match(md, /- 出处：\[示例\]\(https:\/\/example.com\/a\)/);
});

test('buildGlossaryContent: 缺省可选字段不输出', () => {
  const md = buildGlossaryContent({ original: 'x', translated: 'X', glossaryType: 'term' });
  assert.doesNotMatch(md, /phonetic:/);
  assert.doesNotMatch(md, /definition:/);
  assert.doesNotMatch(md, /context:/);
  assert.match(md, /- 类型：单词/);
});
