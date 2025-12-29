# Setup QC for core files

Goal: ensure `bible.md`, `characters.md`, `outline.md`, and `continuity_log.md` are synchronized with each other and with the given requirements. Fix conflicts, fill gaps, and keep terminology consistent.

How to work:
1) Read the requirements first, then the four files in order (bible → characters → outline → continuity_log).
2) Spot mismatches (story world, characters, plot beats, chronology, terminology, tone) and note any missing cross-references.
3) For each file, decide whether it needs an update to stay consistent with the others and the requirements. When you change a file, rewrite the full file content (not a patch).
4) Keep structure and headings intact; prefer minimal edits that achieve synchronization.

Return JSON wrapped in `<<<JSON` ... `JSON>>>`:
```json
{
  "conclusion": "Short summary of overall alignment status.",
  "files": {
    "bible.md": {
      "changed": true,
      "reason": "Why this file needs an update (or false if not).",
      "content": "Full revised markdown if changed=true; otherwise omit or leave blank."
    },
    "characters.md": { "changed": false, "reason": "Already aligned" },
    "outline.md": { "changed": true, "reason": "...", "content": "..." },
    "continuity_log.md": { "changed": true, "reason": "...", "content": "..." }
  }
}
```

Only mark `changed: true` when you supply the complete updated content for that file. Ensure any updated content ends with a trailing newline and preserves markdown readability.
