# 任务：自检 + 实质修改回写 + 生成 `chapter_XX_qc.md`

你将收到：

- `chapter_XX.md`（初稿）
- `chapter_XX_brief.md`
- `bible.md` / `characters.md` / `outline.md` / `continuity_log.md`

你必须做两件事：

1) 文字要求：段落长短与节奏与剧情紧张度匹配，而且富于变化，这里的段落是指带着回车的行，不是用分隔符分开的部分，小说里不要使用分隔符。避免过多的1-2句成段的情况
2) 自检并“实质修改”正文：至少对 2 处场景/对话做具体改写，修掉漂移/过多废话/剧情推进乏力等问题。
3) 生成验收记录 `chapter_XX_qc.md`：列出通过的硬约束、发现的漂移、你如何修掉、剩余风险。

输出必须是严格 JSON（用 `<<<JSON ... JSON>>>` 包裹），包含：

- `revisedChapterMarkdown`：修改后的完整正文（Markdown）
- `qcMarkdown`：验收记录（Markdown）

不要输出其它内容。

