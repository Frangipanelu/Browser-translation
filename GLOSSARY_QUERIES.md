# Glossary 查询模板（复制到 Obsidian 笔记里用）

> 前提：已开启 Dataview 插件；术语笔记在 `Glossary/` 文件夹，且带 YAML frontmatter。
> 每条查询单独存成一个笔记（如 `术语总览.md`），打开即自动渲染。

## ① 全部术语，最新在前
```dataview
TABLE translation AS 释义, type AS 类型, sourceTitle AS 出处, created AS 收藏日
FROM "Glossary"
SORT created DESC
```

## ② 按出处（sourceTitle）分组
```dataview
TABLE translation AS 释义, type AS 类型, created AS 收藏日
FROM "Glossary"
GROUP BY sourceTitle
```

## ③ 按类型（term / idiom / phrase）
```dataview
TABLE term AS 术语, translation AS 释义, sourceTitle AS 出处
FROM "Glossary"
GROUP BY type
```

## ④ 按标签
```dataview
TABLE translation AS 释义, type AS 类型, sourceTitle AS 出处
FROM "Glossary"
WHERE contains(tags, "literature")
SORT created DESC
```

## ⑤ 最近 7 天
```dataview
TABLE translation AS 释义, type AS 类型, sourceTitle AS 出处
FROM "Glossary"
WHERE created >= date(today) - dur(7 days)
SORT created DESC
```

## ⑥ 今日随机撞见（钉在首页，每次打开看几个）
```dataview
TABLE translation AS 释义, sourceTitle AS 出处
FROM "Glossary"
SORT file.ctime DESC
LIMIT 5
```
> 想真·随机可改用 DataviewJS：`dv.pages('#glossary').sample(5)`。
