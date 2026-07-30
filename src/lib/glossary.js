// src/lib/glossary.js
// 术语表文件生成（纯函数，UMD）
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  root.WT = Object.assign(root.WT || {}, mod);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TYPE_LABEL = { term: '单词', idiom: '地道表达', phrase: '词组' };

  // 文件名净化：去掉非法字符、空格转连字符、限长
  function sanitizeFilename(name) {
    return (
      (name || 'term')
        .trim()
        .replace(/[\\/:*?"<>|#^[\]]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 80) || 'term'
    );
  }

  // 构建单条术语的 Markdown 内容（含 YAML frontmatter）
  function buildGlossaryContent(term) {
    const esc = (s) => (s || '').replace(/"/g, '\\"');
    const fm = [];
    fm.push(`term: "${esc(term.original)}"`);
    fm.push(`translation: "${esc(term.translated)}"`);
    fm.push(`type: ${term.glossaryType || 'term'}`);
    if (term.phonetic) fm.push(`phonetic: "${esc(term.phonetic)}"`);
    if (term.definition) fm.push(`definition: "${esc(term.definition)}"`);
    if (term.context) fm.push(`context: "${esc(term.context)}"`);
    if (term.source) fm.push(`source: "${term.source}"`);
    if (term.sourceTitle) fm.push(`sourceTitle: "${esc(term.sourceTitle)}"`);
    const rawTags = (term.tags && term.tags.length ? term.tags : ['glossary'])
      .map((t) => (t || '').trim())
      .filter(Boolean)
      .map((t) => `"${esc(t)}"`);
    fm.push(`tags: [${rawTags.join(', ')}]`);
    fm.push(`created: ${term.created || new Date().toISOString().split('T')[0]}`);

    const typeLabel = TYPE_LABEL[term.glossaryType] || '术语';
    let body = `---\n${fm.join('\n')}\n---\n\n`;
    body += `# ${term.original}\n\n`;
    body += `**${term.translated}**\n\n`;
    if (term.context) body += `> ${term.context}\n\n`;
    body += `- 类型：${typeLabel}\n`;
    if (term.sourceTitle) body += `- 出处：[${term.sourceTitle}](${term.source || '#'})\n`;
    body += `- 收藏于：${term.created || new Date().toISOString().split('T')[0]}\n`;
    return body;
  }

  // 从 URL 取域名（出处标题兜底）
  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  return { TYPE_LABEL, sanitizeFilename, buildGlossaryContent, hostnameOf };
});
