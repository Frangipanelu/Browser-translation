# Obsidian 术语表（Glossary）集成设计

> 定位：划词翻译助手 v2 只保留一个真实价值——**收藏"专业术语 / 地道表达"成个人参考术语表**，导出到 Obsidian 成为可检索、可关联的知识节点。
> 普通生词不进库（记忆靠当场查 + 反复撞见）。气泡保持原样，不做改动。

---

## 一、数据模型（每条术语一个文件）

存放路径：`Glossary/<术语>.md`

每个术语生成一份带 YAML frontmatter 的笔记，便于 Dataview 动态切片：

```markdown
---
term: "serendipity"
translation: "机缘巧合；意外发现美好事物的能力"
type: idiom
phonetic: "/ˌserənˈdɪpəti/"
definition: "the occurrence of events by chance in a happy or beneficial way"
context: "A fortunate stroke of serendipity led to the discovery."   # 选中的原句（可选）
source: "https://en.wikipedia.org/wiki/Serendipity"
sourceTitle: "Serendipity - Wikipedia"
tags: [glossary, en, literature]
created: 2026-07-30
---

# serendipity

**机缘巧合；意外发现美好事物的能力**

> A fortunate stroke of serendipity led to the discovery.

- 类型：地道表达（idiom）
- 出处：[Serendipity - Wikipedia](https://en.wikipedia.org/wiki/Serendipity)
- 收藏于：2026-07-30
```

**字段说明**

| 字段 | 来源 | 说明 |
|------|------|------|
| `term` | 选中文本 | 术语本身 |
| `translation` | 翻译结果 | 中文释义 |
| `type` | 用户选择 | `term`（单词）/ `idiom`（地道表达）/ `phrase`（词组） |
| `phonetic` / `definition` | 词典查询 | 音标 + 英文释义（划词点 ⭐ 收藏时带入） |
| `context` | 选中句子的语境 | **当前版本为空**，后续可在 content.js 加一行提取周围句子 |
| `source` / `sourceTitle` | 当前页 URL / 主机名 | 自动从收藏时的页面地址获得（即"出处"） |
| `tags` | 用户标签 + 默认 `glossary` | 用于分类 |
| `created` | 收藏日期 | 用于按时间切片 |

---

## 二、与"单词本"的关系（精简，不做伪需求）

- 单词本（chrome.storage.local）仍是**临时收件箱**：划词点 ⭐ 先进这里。
- 在单词本页面里，你**精选**值得长期保留的条目，点 📌「存为术语」→ 写入 Obsidian `Glossary/`。
- 普通生词留在收件箱即可，不进 Obsidian、不建术语表。
- 这样既不会"每个词都收"造成垃圾堆，又让 Obsidian 里是**你筛过的领域词汇**。

---

## 三、写入机制（三档降级，确保不丢）

按稳健程度排序，设置里可选：

| 模式 | 原理 | 适用 | 优点 | 缺点 |
|------|------|------|------|------|
| `adv-uri`（默认，推荐） | `obsidian://adv-uri?vault=&filepath=&data=&mode=overwrite` | 装了 Advanced URI 插件 | **无需后端、不碰端口/证书、最省心** | 写入结果无法验证（仅标记未验证）；单术语文件极小，URL 长度问题基本不会触发 |
| `rest` | 调 Obsidian **Local REST API**（`PUT http://127.0.0.1:27123/vault/Glossary/术语.md`） | 装了 Local REST API 插件并开本地服务 | 无 URL 长度限制、可建文件夹、可验证 | 需开服务、端口/HTTPS 证书配置较麻烦 |
| `file`（兜底） | 直接下载 .md 文件 | 都不想装 / Obsidian 没开 | 零依赖 | 需手动拖入仓库 |

**失败自动降级链**：正常走 `adv-uri`（默认）；若 `adv-uri` 真正失败（仓库名空 / URL 超长 / 协议报错）或用户选 `rest`，再分别兜底 → 下载 .md 文件并提示手动放入。永不静默丢失。

> 单术语文件体积极小（几百字节），所以 `adv-uri` 的 URL 长度问题基本不会触发；其唯一代价是写入结果无法验证，故统一标记为「未验证」，绝不伪装成功。

---

## 四、两种写入入口

1. **逐条**：单词本每条卡片上有「类型下拉 + 📌 存为术语」，点一下把该条写成一个 `Glossary/术语.md`。
2. **批量**：工具栏 📑 按钮 =「全部存为术语」，遍历收件箱逐条写入（每条间隔 150ms 避免刷屏）。

---

## 五、Obsidian 侧查询模板（Dataview）

把下面任意一段存成 `Glossary 总览.md` 之类的笔记，`dataview` 插件开启后即可用。

**① 全部术语，最新在前**
```dataview
TABLE translation AS 释义, type AS 类型, sourceTitle AS 出处, created AS 收藏日
FROM "Glossary"
SORT created DESC
```

**② 按出处（sourceTitle）分组**
```dataview
TABLE translation AS 释义, type AS 类型, created AS 收藏日
FROM "Glossary"
GROUP BY sourceTitle
```

**③ 按类型（单词 / 地道表达 / 词组）**
```dataview
TABLE term AS 术语, translation AS 释义, sourceTitle AS 出处
FROM "Glossary"
GROUP BY type
```

**④ 按标签**
```dataview
TABLE translation AS 释义, type AS 类型, sourceTitle AS 出处
FROM "Glossary"
WHERE contains(tags, "literature")
SORT created DESC
```

**⑤ 最近 7 天**
```dataview
TABLE translation AS 释义, type AS 类型, sourceTitle AS 出处
FROM "Glossary"
WHERE created >= date(today) - dur(7 days)
SORT created DESC
```

**⑥ 今日随机撞见（每天打开看几个，落实"反复可见"）**
```dataview
TABLE translation AS 释义, sourceTitle AS 出处
FROM "Glossary"
SORT file.ctime DESC
LIMIT 5
```
> 想要"随机"，可加 `WHERE rand() < 0.2` 之类（需 DataviewJS 更灵活）。把这页钉在 Obsidian 首页/侧边，每次打开都能撞见几个术语。

---

## 六、出错处理 & 边界

- Obsidian 未运行 / 插件未装：`rest` 与 `adv-uri` 都不响应 → 自动降级下载 .md，提示"请手动放入 Glossary 文件夹"。
- 重名术语：同一术语再次「存为术语」→ **覆盖更新**同文件（幂等），不会重复建文件。
- 文件名非法字符：`sanitizeFilename` 去掉 `\ / : * ? " < > | #` 等，空格转 `-`，超限截断 80 字。

---

## 七、后续可增强（非必需）

- **补"原句语境"**：content.js 收藏时多取选中文本周围一句，填入 `context`（仅加一行逻辑，不动气泡 UI）。
- **反向链接**：导出的笔记里 `@[[相关概念]]`，把术语织进你的知识网络。
- **Local REST API 端口自定义**：设置里加端口字段（默认 27123）。
- **增量而非覆盖**：用 REST API 读旧文件 + 追加 `encounterCount`，实现"撞见次数"统计。
