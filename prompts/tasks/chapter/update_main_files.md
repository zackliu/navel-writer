# 更新 `continuity_log.md`（只改这一份）

目标：用最新章节内容刷新 `continuity_log.md`。不要修改 `bible.md`、`characters.md`、`outline.md`。

你将收到：
- `tasks/setup/generate_continuity_log.md`（严格遵循其中的格式与规则）
- 最新稿件 `chapter_XX.md` 和 `chapter_XX_brief.md`
- 现有的 `continuity_log.md`、`bible.md`、`characters.md`、`outline.md`

规则：
- 只在 `files` 中返回 `continuity_log.md`。
- 如果无需更新，设置 `changed=false` 并说明原因。
- 如果 `changed=true`，必须返回完整的 `continuity_log.md` Markdown（末尾保留换行），保持原有结构/标题，在此基础上准确吸收本章信息。
- 理由要简短、清晰。

用 `<<<JSON ... JSON>>>` 包裹输出，格式示例：

{
  "files": {
    "continuity_log.md": {
      "changed": true,
      "reason": "...",
      "content": "完整的 continuity_log.md（仅当 changed=true 时提供）"
    }
  }
}

不要在 `files` 中包含其它文件。
