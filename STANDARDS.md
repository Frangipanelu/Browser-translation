# STANDARDS.md — word-translator-extension 项目标准

> 版本：2.1.4 ｜ 生效日期：2026-07-30（末次修订）
> 适用范围：本仓库所有源码、文档与构建产物。
> 目标：用最少的人为约定，保证「划词翻译助手」长期可维护、可回滚、可验证。
> 末次修订纳入：同步可见性（§7.1）、外部写入兜底与假成功禁令（§7.2）、DOM 绑定崩溃防护（§7.3）。

---

## 1. 产品边界（Product Boundary）

本插件只做一件事：**在任意网页上轻量地查词 / 查证，并把值得保留的内容沉淀为专业术语。**

### 1.1 必须保留的能力（IN）

| 能力 | 说明 | 当前实现 |
| --- | --- | --- |
| 划词内联翻译 | 选中文本弹出气泡，展示翻译 | `content.js` 气泡 UI（保持现状，不重写） |
| 音标展示 | 单词显示音标（/ˈwɜːrd/） | `content.js` 字典查询结果 |
| 朗读 TTS | 点击发音 | `content.js` `speechSynthesis` |
| 自动语言识别 | 中↔英方向自动判定 | `src/lib/lang.js` `detectLang` |
| 多引擎翻译 | Google / MyMemory / DeepL 自动回退 | `src/lib/translate.js` |
| 生词本 | 本地生词收集与管理 | `wordbook.js` + `background.js` |
| 专业术语积累 | 划词一键「存为术语」→ Obsidian 术语表 | `src/lib/glossary.js` + `exportToObsidian` |

### 1.2 明确不做（OUT）

- ❌ 整页翻译 / 网页全文替换。
- ❌ 把翻译结果直接写回页面正文（只展示气泡）。
- ❌ 自建云端账号体系 / 同步服务（术语沉淀交给用户已有的 Obsidian）。
- ❌ 在 `content.js` 中直接发起跨域网络请求（见 §3.2）。
- ❌ 在 `src/lib` 引入任何浏览器 / DOM / `chrome.*` API 依赖（见 §3.3）。

> 边界原则：插件的职责止于「查」与「存」。阅读、整理、复习由 Obsidian + Dataview 完成，不在本项目内。

---

## 2. 代码约束（Code Constraints）

### 2.1 三层架构，单向依赖

```
content.js  ──┐
              ├──► background.js ──► src/lib/*.js  (纯函数，无副作用)
popup.js    ──┘        │
                       └──► chrome.* / fetch (仅此一处触网)
```

- **`content.js`**：只负责 DOM / 气泡 / 用户交互，**不直接 `fetch`**。需要翻译时通过 `chrome.runtime.sendMessage({action:'translate', ...})` 委托给 background。
- **`background.js`**：唯一触网层。Service Worker 通过 `importScripts('src/lib/...')` 加载纯函数库，再对消息路由、调用 `WT.*` 委托函数。
- **`src/lib/*.js`**：纯函数，「单一事实来源」。浏览器与 Node 测试共用同一份代码（UMD 模式）。

### 2.2 网络请求唯一出口

- 所有对外 HTTP 请求 **只允许** 出现在 `background.js` 与 `src/lib/translate.js`（被 background 调用）。
- 翻译函数统一签名接受可注入的 `fetchFn`，默认 `globalThis.fetch`。**测试时注入假 fetch，不触网**（见 §4）。
- 禁止在 `content.js`、`wordbook.js`、`popup.js` 中出现 `fetch` / `XMLHttpRequest` 直接跨域调用。

### 2.3 纯函数单一来源（Single Source of Truth）

| 纯逻辑 | 位置 | 为何抽离 |
| --- | --- | --- |
| 语言检测 `detectLang` / `detectLangCode` | `src/lib/lang.js` | 中英文方向判定，多文件复用 |
| 句子上下文提取 `extractSentence` | `src/lib/context.js` | DOM 无关，易测 |
| 术语文件名 / YAML 构建 `sanitizeFilename` / `buildGlossaryContent` | `src/lib/glossary.js` | 决定 Obsidian 文件结构 |
| 翻译引擎 `translateGoogle/MyMemory/DeepL` / `handleTranslation` | `src/lib/translate.js` | 回退逻辑与可测性 |

约束：
- `src/lib` 内 **不得** 引用 `chrome`、`document`、`window`、`fetch`（默认参数除外）。
- 扩展文件（`background.js`/`content.js`）通过 `WT.xxx()` 调用，**不得** 在自身内联重写同一逻辑（避免逻辑漂移）。
- 修改上述纯逻辑时，**必须** 同步更新或新增对应 `test/*.test.js`。

### 2.4 密钥与配置

- 禁止硬编码 API Key / Token。DeepL 等密钥只从 `chrome.storage` 读取。
- 不提交 `.pem`、`.crx`、密钥文件（见 `.gitignore`）。
- 用户配置默认值写在 `background.js` 常量区，集中、可注释。

### 2.5 消息协议

`content.js` / `popup.js` → `background.js` 统一用 `action` 字段路由。当前动作清单（改前须同步本文档）：

`translate` · `lookup-dictionary` · `test-connection` · `wordbook-add` · `wordbook-list` ·
`wordbook-remove` · `wordbook-tags` · `wordbook-export-obsidian` · `wordbook-export-file` ·
`glossary-save` · `glossary-save-all` · `check-needs-sync` · `clear-sync-flag`

命令快捷键：`open-wordbook`。

---

## 3. 技术回滚（Rollback）

回滚以 **git tag** 为锚点，禁止直接 `git reset --hard` 到他人历史。

### 3.1 标签约定

- 每个发布版本打 annotated tag：`vX.Y.Z`。
- `v2.1.0` = 重构前基线（可一键回到「能用」状态）。
- `v2.1.1` = 当前「纯函数 + 测试」稳定版。
- 补丁修复后递增 Z；新增能力递增 Y；破坏性变更递增 X，并在 README 记录迁移。

### 3.2 回滚操作（推荐：`git revert`）

```bash
# 回退某个有问题的提交（生成反向提交，历史可追溯）
git revert <commit-hash>

# 回到某个发布版本但不改写历史（安全）
git checkout v2.1.0 -- .        # 仅取文件，不切分支
# 或临时体验旧版本
git worktree add ../wt-v210 v2.1.0
```

> 严禁在已推送的共享分支上 `git reset --hard` + `git push --force`。如需强改，须团队确认。

### 3.3 浏览器侧回滚

Chrome `chrome://extensions` → 本插件「详情」→ 从本地 `dist/` 重新「加载已解压的扩展程序」到对应 tag 的代码即可。

---

## 4. 测试与可验证性（Testability）

用户要求：**测试通过才使用**。因此纯逻辑必须可脱离浏览器验证。

- 测试框架：Node 内置 `node --test`，**零外部依赖**（无需 `npm install`）。
- 运行：`npm test` 或 `node --test`。
- 纯函数测试覆盖：`lang` / `context` / `glossary` / `translate`（注入假 `fetch`，断言回退与结果）。
- 提交前必须满足：`node --test` 全绿。CI / 人工提交钩子会拦截失败。
- 浏览器集成（气泡、Obsidian 跳转）无法在 Node 测，靠 `node --check` 语法校验 + 手动验收，不在自动化范围。

---

## 5. Git 提交规范（Conventional Commits）

本仓库强制使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范，便于自动生成变更日志与定位回滚点。

### 5.1 提交信息格式

```
<type>(<optional scope>): <subject>

<optional body>

<optional footer>
```

- `type` 小写，限定以下集合。
- `subject` 以动词开头、祈使句、不加句末句号、≤ 50 字。
- 破坏性变更在 `footer` 写 `BREAKING CHANGE: <说明>`，或在 `type` 后加 `!`（如 `feat!: ...`）。

### 5.2 type 清单

| type | 含义 | 示例 |
| --- | --- | --- |
| `feat` | 新功能 | `feat(glossary): 支持存为术语到 Obsidian` |
| `fix` | 修 bug | `fix(translate): 修复中文→英文方向误判` |
| `refactor` | 重构（无行为变化） | `refactor(lib): 抽离纯函数到 src/lib` |
| `test` | 增改测试 | `test(translate): 覆盖 MyMemory 回退` |
| `docs` | 文档 | `docs: 补充 STANDARDS.md` |
| `chore` | 构建/工具/杂项 | `chore: 添加 commit-msg 钩子` |
| `style` | 格式（不影响逻辑） | `style: 统一缩进` |
| `perf` | 性能 | `perf(content): 减少重复查询` |

### 5.3 提交示例（本仓库首批）

```
chore: 初始化仓库与 .gitignore

refactor(lib): 抽离 lang/context/glossary/translate 纯函数到 src/lib
refactor(background): 通过 importScripts 委托 WT.* 保持行为不变

test: 新增 lang/context/glossary/translate 单测（19 项全绿）

docs: 新增 STANDARDS.md 与提交规范
docs: 更新 README 至 v2.1.1

chore: 打 tag v2.1.0 (基线) 与 v2.1.1 (稳定版)
```

### 5.4 离线强制校验

提交钩子 `scripts/commit-msg`（零依赖 shell）会在 `git commit` 时校验消息首行是否匹配 `^(feat|fix|refactor|test|docs|chore|style|perf)(\(.+\))?: .+`。
不符合则拒绝提交。详见 `commitlint.config.js`（供安装了 `@commitlint/cli` 的环境使用，二者规则一致）。

---

## 6. 发布检查清单（Release Checklist）

- [ ] `node --test` 全绿
- [ ] 所有 JS 文件 `node --check` 通过
- [ ] `manifest.json` version 已递增
- [ ] README / STANDARDS 与代码一致
- [ ] `git tag -a vX.Y.Z -m "..."` 已打
- [ ] 已 `chrome://extensions` 加载验证气泡 / 音标 / 存术语
- [ ] 同步状态在单词本页面**常驻可见**（同步药丸 + Obsidian 连接状态，见 §7.1）
- [ ] 向 Obsidian 等外部写入**无假成功**、不可达时有 `.md` 兜底与诚实反馈（见 §7.2）

---

## 7. 已知坑（Known Pitfalls）— 硬性约束

下列条目来自真实事故（v2.1.2 / v2.1.3 / v2.1.4 三次修复）。**违反任一条即视为 bug，必须修复后才能发布，不得用"能用就行"放行。**

### 7.1 同步状态必须常驻可见（Sync Visibility）

- **规则**：凡涉及"数据是否已同步 / 外部写入是否成功"的状态，必须在 UI 上**常驻展示**，不得仅依赖一次性横幅、toast 或纯图标按钮呈现。
- **最低要求**：单词本页面须常驻显示
  - 「同步状态药丸」：`暂无单词` / `● 待同步` / `● 已是最新`；
  - 「Obsidian 连接状态」：`✓ 已连接` / `✕ 未连接` / `? 状态未知`。
  - 二者反映同一事实，在加载、增删、导出、横幅显隐等节点统一刷新。
- **反例（已修复 v2.1.3）**：工具栏只用 📑/📥 无文字图标，同步提示靠"有待同步且单词非空才出现的临时横幅"。用户反馈"看不到同步信息"。

### 7.2 外部写入不可达必须兜底，且禁止假成功（No Silent Failure）

- **规则**：凡是向外部系统（Obsidian 等）写入，必须处理"目标不可达"分支：

  1. **绝不假成功**：不得在未验证写入结果的情况下返回 `success: true`。仅 `chrome.tabs.create({url:'obsidian://...'})` 即报成功属违规，返回须带 `unverified` 标记或真实 `ok`。
  2. **必须兜底**：不可达时生成**可下载的 `.md` 文件**（批量则合并为单个 `Glossary-日期.md`），引导用户手动放入仓库 Glossary 文件夹。
  3. **诚实反馈**：提示须区分三种结果——`已写入 Obsidian` / `已下载文件兜底（Obsidian 未运行）` / `需安装对应插件`——不得用"已存为术语 N 条"掩盖失败。

- **机制约定**：
  - `rest` 模式应探测端口（`fetch http://127.0.0.1:27123`）验证可达性，可返回真实 `ok`；
  - `adv-uri` / `file` 模式无法验证写入，须明示"状态未知/未验证"，**严禁伪装成功**；
  - 文件兜底逻辑**不得**因"看似成功"的提前 `return` 而永远走不到。
- **反例（已修复 v2.1.4）**：`openObsidianUri` 无条件 `success:true`，Obsidian 没开时文件未生成却报成功，且文件兜底分支因提前 `return` 永久失效。

### 7.3 DOM id 一次性绑定崩溃（全页瘫痪防护）

- **规则**：`wordbook.js` 等页面脚本在 `init()` 中绑定大量 `getElementById(...).addEventListener`。**任一 id 在 HTML 中缺失 → `null.addEventListener` 抛错 → 整页 init 中断**，表现为列表空白、保存失效等连锁症状。
- **防护**：JS 引用的所有 DOM id **必须** 存在于对应 HTML（动态创建者除外）。已由 `test/dom-bindings.test.js` 静态回归校验，修改页面时**不得**移除该测试或使其中 `@allowedMissing` 名单扩大化。
- **反例（已修复 v2.1.2）**：`wordbook.js` 用 `wb-set-mode`，HTML 中为 `wb-set-mechanism`，init 第 31 行崩溃，单词本列表与保存设置全废。
