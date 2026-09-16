# 划词翻译助手

选中即翻译的 Chrome/Edge 扩展。核心定位：**轻量内联查词（保阅读流畅）+ 选择性「存为术语」（建个人术语表）**。

> 适用场景：自己读外刊 / 看外语视频时，遇到专业术语、地道表达，划词即译不打断；判断「值得留」的词，一键存进 Obsidian 沉淀为可检索的术语库。

## 版本

- **v2.0（当前）**：新增 Obsidian 术语表（Glossary，一词一文件 + Dataview 可查询）；自动采集「原句语境」与「出处」；单词本收藏聚焦「存为术语」；恢复并增强发音功能（真人音频优先 + 系统 TTS 兜底）。
- v1.0.0：早期版本（多引擎备用、手动方向切换、消除开发者模式警告、Obsidian 同步修复），历史代码已备份为 git tag `backup-v1.0.0`。

## 功能特性

| 功能 | 说明 |
|------|------|
| 划词翻译 | 任意网页选中文字，松手弹出翻译气泡 |
| 中英双向 | 自动检测 + 手动切换方向 |
| 多引擎备用 | Google → MyMemory 自动降级，提高成功率 |
| 音标 + 释义 | 英文单词显示音标、词性、词典释义 |
| 发音（🔊） | 划词气泡点 🔊 朗读；优先播放词典真人发音音频，无音频或播放失败自动回退系统 TTS。英文原文常驻显示，不依赖词典接口 |
| 单词本发音 | 单词本每条词条的音标旁有 🔊，可随时重听 |
| 收藏到单词本 | ⭐ 一键收藏，支持标签、搜索筛选 |
| 存为术语（📌） | 在单词本给每条选「类型」，一键写入 Obsidian 术语表 |
| 原句语境采集 | 收藏时自动记录划词所在的句子 + 页面出处 |
| Markdown 下载 | 导出为 .md 文件 |
| 连接测试 | 设置页检测翻译服务连通性 |
| 无开发者模式警告 | 附注册表策略脚本 |

## 安装

### 方式 A：开发者模式加载（简单）

1. 打开 `chrome://extensions` 或 `edge://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `word-translator-extension` 文件夹

### 方式 B：打包 .crx + 注册表策略（消除警告）

1. 运行 `pack-extension.ps1`（或在浏览器扩展页面手动打包）
2. 将生成的 `.crx` 拖入 `chrome://extensions` 安装
3. 双击 `install-policy.reg` 合并注册表
4. 重启浏览器，开发者模式警告不再出现

> 如需移除策略，双击 `uninstall-policy.reg`

## 使用

### 划词翻译
1. 选中英文或中文文字
2. 翻译气泡自动弹出
3. 点击 🔄 切换翻译方向
4. 点击 ⭐ 收藏到单词本
5. 点击 🔊 朗读原文
6. 点击 📋 复制译文

### 单词本
- `Ctrl+Shift+W` 打开单词本
- 支持搜索、标签筛选、删除
- 每条卡片有「类型」下拉（单词 / 地道表达 / 词组）和 📌「存为术语」按钮
- 工具栏 📑「全部存为术语」：把收件箱所有词批量推送到 Obsidian 术语表
- 有未同步变更时页面顶部显示提示横幅

### 设置
- 翻译引擎：Google（推荐）+ MyMemory 自动备用 / DeepL
- Obsidian 术语表：仓库名、写入方式（Local REST API / Advanced URI / 文件下载）、文件夹（默认 `Glossary`）、API Key、端口

## Obsidian 术语表（Glossary）

把收藏的词沉淀为**结构化术语条目**，而不是一段纯文本 —— 这是与「网页剪藏工具」最大的区别。

### 每条术语长这样

写入 `Glossary/<术语>.md`：

```markdown
---
term: "hello"
translation: "你好"
type: idiom
phonetic: "həˈləʊ"
definition: "..."
context: "Hello world, this is a test sentence."   # ← 划词时所在的原句
source: "https://example.com/article"
sourceTitle: "示例页面标题"
tags: ["glossary", "商务英语"]
created: 2026-07-30
---

# hello

**你好**

> Hello world, this is a test sentence.

- 类型：地道表达
- 出处：[示例页面标题](https://example.com/article)
- 收藏于：2026-07-30
```

`context` 字段是**划词时选中文字所在的整句话**（自动截取所在句子），`source` / `sourceTitle` 是页面 URL 与标题。这样术语不是孤立词条，而是带着阅读语境和出处，方便日后回看。

### 三种写入方式（自动降级）
1. **Advanced URI（默认，推荐）**：Obsidian 安装 Advanced URI 插件，用 `obsidian://` 协议写入，**无需开任何本地服务、不碰端口与证书**，最省心。
2. **Local REST API**：装 Local REST API 插件并开本地服务端口（HTTPS 27124 / HTTP 27123），无 URL 长度限制，但配置较麻烦。
3. **文件下载**：Obsidian 未响应时，随时点「导出为文件」下载 .md，手动放入 `Glossary/` 文件夹。

### 使用步骤
1. Obsidian 装 **Advanced URI** 插件（推荐）并启动；
2. 扩展设置写入方式选 `adv-uri`（默认即为它）。**仓库名可留空**——留空时自动写入你当前正在打开的 Obsidian 仓库，无需手动填名字；
3. 网页划词收藏 → 单词本里给值得留的条目选「类型」→ 点 📌 存为术语；
4. 在 Obsidian 用 `GLOSSARY_QUERIES.md` 的模板按出处 / 类型 / 标签检索。

> 注：若手动填写仓库名，请填 Obsidian 左侧边栏显示的**仓库名称**（如 `Knowledge`），**不要**填文件夹路径（如 `D:\obsidian\...`）或在 Obsidian 中改名后的旧名——否则会报 "Vault not found"。留空最稳妥。

### 查询与复用
- 完整设计文档：`OBSIDIAN_DESIGN.md`
- 现成 Dataview 查询模板：`GLOSSARY_QUERIES.md`（全部 / 按出处 / 按类型 / 按标签 / 近 7 天 / 今日随机）

## 文件结构

```
word-translator-extension/
├── manifest.json          # 扩展配置 (v2.0)
├── background.js           # Service Worker（翻译引擎+词典+存储+术语表写入）
├── content.js             # 页面注入（划词+气泡+原句语境采集）
├── content.css            # 气泡样式
├── popup.html / popup.js   # 工具栏弹窗
├── wordbook.html / .js / .css  # 单词本页面（含存为术语）
├── pack-extension.ps1      # .crx 打包脚本
├── install-policy.reg      # 注册表策略（消除开发者模式警告）
├── uninstall-policy.reg    # 移除策略
├── ANALYSIS.md             # 产品分析与改进报告
├── OBSIDIAN_DESIGN.md      # 术语表设计文档
├── GLOSSARY_QUERIES.md     # Dataview 查询模板
├── icons/                  # 扩展图标
└── README.md               # 本文件
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+W` | 打开单词本 |
| `Esc` | 关闭翻译气泡 |

## 常见问题

**Q：翻译不出来？**
A：点击设置页面的「测试翻译连接」。Google 不可用时会自动切换 MyMemory 备用引擎。如果两个都不可用，请检查 VPN。

**Q：开发者模式警告怎么消除？**
A：运行 `pack-extension.ps1` 打包为 .crx，然后合并 `install-policy.reg` 注册表策略，重启浏览器。

**Q：Obsidian 术语表写入没反应？**
A：确认已安装 Local REST API（或 Advanced URI）插件，仓库名拼写正确（区分大小写），Obsidian 正在运行。若仍失败会自动降级为下载 .md 文件。

**Q：术语的「原句语境」是空的？**
A：原句在收藏的那一刻从页面截取（划词所在的整句话）。如果当时选中文本跨多个 HTML 节点、无法定位单句，则该条语境留空，但出处 URL 仍会记录。

**Q：某些页面划词不出气泡？**
A：Chrome 商店、系统页面等禁止扩展注入，是浏览器安全限制。

MIT
