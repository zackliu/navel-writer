# Novel Engine（Node.js）

一个“把小说写成工程”的本地网站：

- 前端：类 ChatGPT 的交互界面，可浏览/编辑 Markdown 文件。
- 后端：两类主流程（生成设定 / 发展剧情），并把“主轴 prompt + 账本文件”作为外部约束控制上下文与输出。

## 目录结构

- `prompts/axis/`：主轴 prompt（硬约束与账本规则）
- `prompts/tasks/`：任务 prompt（生成设定 / 写章 / QC / 回写主文件 / 汇总旧章）
- `templates/`：4 个主文件的模板
- `public/`：Web UI 静态文件
- `src/`：后端代码

## 启动

1) 进入目录：

```powershell
cd novel-engine
```

2) 设置 OpenAI Key（二选一）：

- 环境变量：

```powershell
$env:OPENAI_API_KEY="..."
```

- 或复制 `config.example.json` 为 `config.json` 并填写 `openai.apiKey`：

```powershell
Copy-Item config.example.json config.json
```

3) 启动服务：

```powershell
npm start
```

4) 打开：

- `http://127.0.0.1:8787`

## 使用方式

### 1) 生成设定（初版四文件）

在「生成设定」里填写需求，默认写到 `drafts/`（不覆盖现有文件）。

- 若要覆盖写入：选择 `overwrite`（会把旧文件备份到 `runs/<runId>/backup/`）。

### 2) 发展剧情（每次写一章）

在「发展剧情」里运行后，会自动：

1. 把 `bible.md / characters.md / outline.md / continuity_log.md` 放入上下文
2. 放入最近 3 章全文；更早的章节会汇总到 `chapters/_summary.md`
3. 生成 `chapters/chapter_XX_brief.md`
4. 写 `chapters/chapter_XX.md`
5. QC + 实质修改回写，并生成 `chapters/chapter_XX_qc.md`
6. 更新四个主文件（默认覆盖写入，并备份到本次 `runs/<runId>/backup/`）

## API（可选）

- `POST /api/generate-setup`
- `POST /api/develop-chapter`
- `GET /api/state`
- `GET /api/files`
- `GET /api/file?path=...`
- `POST /api/file`
