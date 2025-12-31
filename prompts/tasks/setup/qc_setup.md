# 核心设定文件 QC（bible / characters / outline / continuity_log）

目标：让 `bible.md`、`characters.md`、`outline.md`、`continuity_log.md` 彼此一致，并与需求对齐；修正冲突、补足缺口、统一术语。

工作方式：
1) 先读需求，再按顺序读四个文件（bible → characters → outline → continuity_log）。
2) 找出不一致（世界观、角色、情节节奏、时间顺序、术语、语气），记录缺失的互相引用。
3) 逐个文件判断是否需要更新以保持一致；若更新，重写该文件的完整内容（不是补丁）。
4) 保持原有结构与标题，尽量少改即可同步。

返回 JSON，外层用 `<<<JSON` ... `JSON>>>` 包裹：
```json
{
  "conclusion": "整体一致性的简短总结",
  "files": {
    "bible.md": {
      "changed": true,
      "reason": "需要更新的原因（若不需要则为 false/简述）",
      "content": "changed=true 时提供完整的更新后 markdown；否则可省略或留空"
    },
    "characters.md": { "changed": false, "reason": "已对齐" },
    "outline.md": { "changed": true, "reason": "...", "content": "..." },
    "continuity_log.md": { "changed": true, "reason": "...", "content": "..." }
  }
}
```

只有在提供完整更新内容时才写 `changed: true`。任何更新后的内容需以换行结尾并保持 Markdown 可读。
