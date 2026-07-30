/**
 * commitlint.config.js — 与 scripts/commit-msg 钩子规则保持一致。
 * 仅当安装 @commitlint/cli 时生效；离线场景下以 scripts/commit-msg 为准。
 *
 * 安装（可选）：npm i -D @commitlint/cli
 * 启用：npx husky add .husky/commit-msg "npx --no -- commitlint --edit $1"
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // type 限定为本仓库白名单
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'style', 'perf'],
    ],
    // 必须有 scope 或正文（subject 非空即可）
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    // 不强求 scope
    'scope-empty': [0, 'always'],
    // 中文/英文 subject 均可，禁用句末句号
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 100],
  },
};
