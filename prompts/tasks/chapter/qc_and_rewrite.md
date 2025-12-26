# 任务：自检 + 实质修改回写 + 生成 `chapter_XX_qc.md`

你将收到：

- `chapter_XX.md`（初稿）
- `chapter_XX_brief.md`
- `bible.md` / `characters.md` / `outline.md` / `continuity_log.md`

你必须做两件事：

1) 自检并“实质修改”正文：至少对 2 处场景/对话做具体改写，修掉漂移/软化/无代价等问题。
2) 生成验收记录 `chapter_XX_qc.md`：列出通过的硬约束、发现的漂移、你如何修掉、剩余风险。

输出必须是严格 JSON（用 `<<<JSON ... JSON>>>` 包裹），包含：

- `revisedChapterMarkdown`：修改后的完整正文（Markdown）
- `qcMarkdown`：验收记录（Markdown）

不要输出其它内容。

