# 任务：写完一章后更新 4 个主文件

你将收到：

- 修改后的 `chapter_XX.md`
- `chapter_XX_brief.md` / `chapter_XX_qc.md`
- 现有 `bible.md` / `characters.md` / `outline.md` / `continuity_log.md`

目标：把“新增不可逆后果、线索状态、人物状态变化、禁改事实新增项”回写进账本与骨架里；只改动必要部分，并为每个文件写清楚变更原因。

输出必须是严格 JSON（用 `<<<JSON ... JSON>>>` 包裹），格式：

{
  "files": {
    "bible.md": { "changed": false, "reason": "..." },
    "characters.md": { "changed": true, "reason": "...", "content": "完整新文件内容" },
    "outline.md": { "changed": true, "reason": "...", "content": "完整新文件内容" },
    "continuity_log.md": { "changed": true, "reason": "...", "content": "完整新文件内容" }
  }
}

规则：

- 如果 `changed=false`，不要输出 `content` 字段。
- 如果 `changed=true`，`content` 必须是完整文件内容（Markdown），并且尽量保持未变化部分原文不动。
- `continuity_log.md` 必须至少更新：禁改事实/线索状态/人物状态 三者之一（通常都要）。
- 对于任何 `changed=true` 的文件：必须在文件顶部的“变更说明/版本记录”里追加一条与本章相关的变更记录，写清楚你为什么改、改了什么（简短、可审计）。

不要输出其它内容。
