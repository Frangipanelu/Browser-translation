# 划词翻译助手 v1.0.0

一款极简的 Chrome/Edge 浏览器扩展，**选中即翻译**，自动收藏生词到单词本，支持导出到 Obsidian。安装即用，零配置。

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 划词翻译 | 任意网页选中文字，松手弹出翻译气泡 |
| 中英双向 | 自动检测中→英 / 英→中，无需手动切换 |
| 音标 + 释义 | 英文单词显示音标、词性、词典释义（免费 Dictionary API） |
| TTS 发音 | 点击 🔊 按钮朗读英文单词（Web Speech API） |
| 单词本 | 一键 ⭐ 收藏，支持标签分组、搜索筛选 |
| Obsidian 导出 | 按标签分 H2 分组，写入单一 .md 文件（模板 B 简约纯表格） |
| Markdown 下载 | 单词本导出为 .md 文件，拖入任意笔记工具 |
| 关闭提醒 | 关闭单词本时若有未同步单词，弹出确认提示 |
| 免费引擎 | Google 翻译 + Dictionary API，无需 API Key |

---

## 安装

1. 打开 Chrome/Edge，地址栏输入 **`chrome://extensions`** 或 **`edge://extensions`**
2. 开启 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择 `subtitle-translator-extension` 文件夹
5. 工具栏出现图标 → 点图钉固定

安装完成，无需任何配置，直接使用。

> **⚠️ 关于网络**：本扩展使用 Google 翻译免费接口，**国内需要科学上网**才能正常翻译。如果不想挂代理，可以自行修改 `background.js` 中的翻译 API 地址为国内可用的替代方案。

---

## 使用方式

### 划词翻译

1. 打开任意网页
2. **选中**一段英文或中文文字
3. 松开鼠标，翻译气泡自动弹出，含音标 + 词性释义
4. 点击 ⭐ 收藏到单词本（可选填标签）
5. 点击 🔊 朗读原文（英文单词）
6. 点击 📋 复制译文

### 单词本

- **快捷键** `Ctrl+Shift+W` 打开
- 卡片式展示：原文 [音标] + 释义 + 译文
- 支持搜索词条、按标签筛选、删除
- 关闭页面时若有单词，弹出确认提示是否同步到 Obsidian

### 工具栏弹窗

点击插件图标弹出小窗，显示：
- 今日收藏数
- "打开单词本"按钮
- "设置"入口

---

## 设置

在单词本页面点击 ⚙ 设置：

| 设置项 | 说明 |
|--------|------|
| 翻译引擎 | Google 翻译（免费，默认） |
| Obsidian 仓库名 | 填入 Obsidian 仓库名，导出时自动创建笔记 |
| 同步模式 | Advanced URI — 通过 obsidian:// 协议直写 |

---

## Obsidian 导出

1. 安装 [Advanced URI](https://github.com/Vinzent03/obsidian-advanced-uri) Obsidian 插件
2. 设置中填入你的仓库名（Obsidian 左侧面板显示的名称）
3. 单词本页面点击 📑 导出按钮
4. 自动按标签分 H2 分组创建笔记：`单词本-日期.md`
5. 导出格式为**模板 B**：简约纯表格（原文 / 音标 / 释义 / 译文）

> 未填仓库名时自动降级为下载 .md 文件，手动拖入仓库即可。
>
> 关闭单词本页面时，若有未同步的单词，会弹出原生确认框提醒你手动导出。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+W` | 打开单词本 |
| `Esc` | 关闭翻译气泡 |

---

## 文件结构

```
subtitle-translator-extension/
├── manifest.json      # 扩展配置
├── background.js      # Service Worker（翻译 + 单词本存储 + Obsidian 导出）
├── content.js         # 页面注入（划词检测 + 翻译气泡 + 音标/释义/TTS）
├── content.css        # 气泡样式
├── popup.html         # 工具栏弹窗
├── popup.js
├── wordbook.html      # 单词本页面
├── wordbook.js
├── wordbook.css
├── icons/             # 扩展图标
└── README.md
```

---

## 技术栈

- **Manifest V3** — Chrome 最新扩展规范
- **Service Worker** — 后台翻译 API 调用 + 本地存储
- **Google Translate API** — 免费公共翻译接口 (`translate.googleapis.com`)
- **Dictionary API** — 免费词典接口 (`api.dictionaryapi.dev`)，获取音标 + 词性 + 释义
- **Web Speech API** — 浏览器原生 TTS，无需外部服务
- **chrome.storage.local** — 单词本本地持久化
- **obsidian:// Advanced URI** — 直接写入 Obsidian 仓库

---

## 常见问题

**Q：翻译不出来？**
A：检查网络。Google 翻译在国内可能偶尔不稳定，刷新页面重试即可。

**Q：发音没声音？**
A：确保浏览器有音频输出，部分网页可能需要用户先点击过页面（浏览器自动播放策略）。

**Q：Obsidian 导出没反应？**
A：确保已安装 Advanced URI 插件，仓库名拼写完全一致（区分大小写），且 Obsidian 正在运行。

**Q：收藏的单词去哪了？**
A：存在浏览器本地。卸载扩展会丢失，记得定期导出。

**Q：某些页面划词不出气泡？**
A：Chrome 商店、系统页面等禁止扩展注入，是浏览器安全限制。

---

MIT
