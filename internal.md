# internal.md（给第一次接触本项目的人）

这份文档从“完全不知道项目是什么”开始，逐层讲到：主流程怎么跑、会生成哪些文件、每个目录/文件负责什么、以及你想改流程时应该从哪里下手。

---

## 0. 这个项目到底在做什么？

一句话：这是一个“本地小说写作工作流引擎”。它用一套可审计的 Prompt（提示词体系）驱动大模型，来：

1. 生成/维护小说的 4 个“主文件”（世界观与设定、人物卡、纲要、连续性日志）
2. 按章节推进写作：先产出章节简报（brief）→ 再写正文 → QC（质检+重写）→ 反向更新主文件
3. 把每次运行的输入/步骤/输出写入 `runs/<runId>/run.json`，便于追溯与复盘

项目同时包含一个 Node.js 服务器和一个简单的 Web UI，方便你点击按钮跑流程、查看日志、编辑生成的 Markdown 文件。

---

## 1. 5 分钟上手（只关心怎么跑起来）

1) 进入引擎目录并启动：

```powershell
cd novel-engine
npm start
```

2) 配置 OpenAI Key（二选一）：

- 环境变量：`OPENAI_API_KEY`
- 或本地配置：`novel-engine/config.json`（此文件已在 `novel-engine/.gitignore` 里忽略，避免提交密钥）

3) 打开 UI：

- `http://127.0.0.1:8787`

---

## 2. 你需要先理解的 5 个关键概念

### 2.1 `novelRoot`：小说工程根目录（最重要）

引擎启动后，会把“小说工程根目录”当成所有读写的根（默认是 `novel-engine/novel-output`）。

- 4 个主文件默认在 `novelRoot/` 下：`bible.md`、`characters.md`、`outline.md`、`continuity_log.md`
- 章节文件在 `novelRoot/chapters/` 下
- 运行日志在 `novelRoot/runs/` 下
- 草稿输出在 `novelRoot/drafts/` 下

`novelRoot` 的来源与优先级（从高到低）：

1. 环境变量：`NOVEL_ROOT`
2. `novel-engine/config.json` 的 `novelRoot`
3. 默认：`path.resolve(engineRoot, "novel-output")`

对应代码：`novel-engine/src/config.ts`

### 2.2 “4 个主文件”（Core Files）

这四个文件是整个写作系统的“世界状态”：

- `bible.md`：世界观/设定/规则/基调（项目的“真相”）
- `characters.md`：人物卡与关系网
- `outline.md`：全书结构与剧情推进蓝图
- `continuity_log.md`：连续性日志（每章发生了什么、哪些设定被确认/修改、避免前后矛盾）

对应代码常量：`novel-engine/src/novel/pathing.ts` 里的 `CORE_FILES`

### 2.3 “Prompts 分两层”：Axis 与 Tasks

- `prompts/axis/`：系统级“轴心规则”（更像写作宪法/总规），会拼接成 system prompt
- `prompts/tasks/`：每一步工作对应的 task prompt（更像 SOP/工单），会作为 user prompt 的一部分

对应代码：`novel-engine/src/prompts/promptLoader.ts`

### 2.4 “写入模式”：`draft` vs `overwrite`

你会在 UI 里看到两类写入模式：

- Setup 流程的 `writeMode`：
  - `overwrite`：直接写到主文件位置；并尝试把旧文件备份到 `runs/<runId>/backup/`
  - `draft`：写到 `drafts/<runId>/`，不影响主文件
- Chapter 流程的 `mainWriteMode`（只影响“更新主文件”这一步）：
  - `overwrite`：直接改 4 个主文件；并尝试备份旧文件到 `runs/<runId>/backup/`
  - `draft`：把更新后的主文件写到 `runs/<runId>/draft_main_files/`，不覆盖主文件

注意：章节文件（`chapters/chapter_XX*.md`）始终写入 `chapters/`，同名会覆盖。

### 2.5 `runs/<runId>/run.json`：可审计账本

每次点按钮跑流程都会生成一个 run 目录（setup 或 chapter）：

- `runs/<runId>/run.json`：输入、步骤、每一步用的模型与温度、输出路径与 token 用量等
- `runs/<runId>/backup/`：仅在 overwrite 且目标文件存在时，才会备份到这里

对应代码：`novel-engine/src/runs/runStore.ts`

---

## 3. 主流程一：Setup（生成 4 个主文件）

### 3.1 这一步做什么

目标：在你还没写正文前，先把小说的“世界状态”搭起来（或重建/修订）。

输入（UI 里填）：

- 需求说明 `requirements`（你希望这本小说是什么、约束是什么）
- 选择生成哪些主文件
- 选择写入模式（draft/overwrite）
- 可选：为每个文件指定模型

输出（写入 `novelRoot/` 或 `drafts/<runId>/`）：

- `bible.md`
- `characters.md`
- `outline.md`
- `continuity_log.md`

### 3.2 代码与 Prompt 的入口在哪里

API：

- `POST /api/generate-setup` → `novel-engine/src/workflows/generateSetup.ts`

Prompt：

- Axis（系统规则）：`novel-engine/prompts/axis/*.md`
- Setup tasks：`novel-engine/prompts/tasks/setup/*.md`
- 结构模板：`novel-engine/templates/*.template.md`

“把哪个 task 用于哪个主文件”的映射在：

- `novel-engine/src/workflows/generateSetup.ts`（`taskPromptForFile` / `templateForFile`）

---

## 4. 主流程二：Chapter（推进写作 + 反向更新主文件）

### 4.1 这一步做什么（按顺序）

当主文件存在后，你可以开始推进章节。流程大致是：

1. （可选）生成 `chapters/_summary.md`：当历史章节 > 3 时，把更早的章节压缩总结（保留最近 3 章原文）
2. 生成章节简报：`chapters/chapter_XX_brief.md`
3. 写章节正文：`chapters/chapter_XX.md`
4. QC + 重写：生成 `chapters/chapter_XX_qc.md`，并把重写后的正文回写到 `chapters/chapter_XX.md`
5. 更新 4 个主文件：让大模型基于“本章发生的事情”去修订 `bible.md/characters.md/outline.md/continuity_log.md`

### 4.2 章节号是怎么决定的

- UI 不填 `chapterNumber`：自动取 `chapters/` 下已存在的 `chapter_XX.md` 最大编号 + 1
- UI 指定 `chapterNumber`：就按指定写（同名会覆盖）

对应代码：`novel-engine/src/novel/chapters.ts`（`listChapterNumbers`）

### 4.3 代码与 Prompt 的入口在哪里

API：

- `POST /api/develop-chapter` → `novel-engine/src/workflows/developChapter.ts`

Prompt（Chapter tasks）：

- `novel-engine/prompts/tasks/chapter/generate_chapter_brief.md`
- `novel-engine/prompts/tasks/chapter/write_chapter.md`
- `novel-engine/prompts/tasks/chapter/qc_and_rewrite.md`
- `novel-engine/prompts/tasks/chapter/update_main_files.md`
- `novel-engine/prompts/tasks/chapter/summarize_older_chapters.md`

### 4.4 “QC / Update 返回 JSON”的协议在哪里

部分步骤要求大模型按固定标记输出 JSON（形如 `<<<JSON ... JSON>>>`），服务端会解析并写入文件：

- JSON 解析：`novel-engine/src/utils/structuredOutput.ts`
- 哪些步骤必须返回 JSON：`novel-engine/src/workflows/developChapter.ts`（QC 与 Update 两步）
- 具体 JSON schema 写在对应的 task prompt 里（`qc_and_rewrite.md`、`update_main_files.md`）

---

## 5. 运行后会出现哪些文件/目录（在 `novelRoot/` 下）

### 5.1 固定（或最终会有）的目录

- `runs/`：每次运行一份账本与备份
- `chapters/`：章节文件（第一次生成章节时创建）
- `drafts/`：setup 的 draft 输出（选择 draft 模式时创建）

### 5.2 文件清单（最常见）

- 主文件：
  - `bible.md`
  - `characters.md`
  - `outline.md`
  - `continuity_log.md`
- 章节文件（按章递增）：
  - `chapters/chapter_01_brief.md`
  - `chapters/chapter_01.md`
  - `chapters/chapter_01_qc.md`
  - ...
- 章节汇总（当章节较多时）：
  - `chapters/_summary.md`（含注释 `<!-- summary_up_to: N -->`）
- 运行账本：
  - `runs/<runId>/run.json`
  - `runs/<runId>/backup/...`（仅 overwrite 且目标存在时）

---

## 6. 目录与文件说明（按实际仓库结构）

### 6.1 仓库根目录（小说工程）

- `bible.md`：主文件（世界观/设定）
- `characters.md`：主文件（人物）
- `outline.md`：主文件（大纲）
- `continuity_log.md`：主文件（连续性）
- `runs/`：运行日志与备份（由引擎生成）
- `chapters/`：章节输出（由引擎生成，可能尚未存在）
- `drafts/`：草稿输出（由引擎生成，可能尚未存在）
- `novel-engine/`：工作流引擎本体（服务器 + UI + prompts）

### 6.2 `novel-engine/`（引擎工程）

你可以把它当成一个最小化的 Node.js Web 服务：

- `README.md`：引擎使用说明（概览）
- `package.json` / `package-lock.json`：依赖与脚本
- `tsconfig.json`：TypeScript 编译配置
- `server.ts`：服务入口（启动 HTTP server，挂载 router）
- `config.example.json`：配置样例（复制成 `config.json`）
- `config.json`：本地配置（通常含 key，不应提交）
- `dist/`：编译产物（`npm start` 前会 `tsc` 生成；不要手改）
- `node_modules/`：依赖（不要手改）
- `public/`：Web UI 静态资源
  - `public/index.html`：页面骨架
  - `public/style.css`：样式
  - `public/app.js`：前端逻辑（调 API、SSE 日志、文件编辑器）
- `prompts/`：提示词体系（项目“灵魂”）
  - `prompts/axis/*.md`：系统级规则（拼接顺序在 `src/prompts/promptLoader.ts` 固定写死）
  - `prompts/tasks/**`：每一步的任务提示词
- `templates/`：主文件模板（setup 生成时会作为结构骨架）
- `src/`：服务端核心逻辑（重点看这里）
  - `src/config.ts`：读取 env/config.json，生成运行配置（host/port/novelRoot/model/temperature）
  - `src/llm/openaiChat.ts`：OpenAI Chat Completions 调用封装
  - `src/prompts/promptLoader.ts`：加载 axis/tasks/templates
  - `src/novel/pathing.ts`：novelRoot 路径安全、核心文件清单、runs/drafts/chapters 目录定位
  - `src/novel/files.ts`：读写 UTF-8、列文件、用户路径校验（防止越界）
  - `src/novel/chapters.ts`：章节命名、列表、读写、summary 读写
  - `src/runs/runStore.ts`：创建 run、追加步骤、写 outputs（生成 `runs/<runId>/run.json`）
  - `src/workflows/generateSetup.ts`：Setup 工作流（按文件循环生成）
  - `src/workflows/developChapter.ts`：Chapter 工作流（summary→brief→write→qc→update）
  - `src/server/router.ts`：API 路由（/api/state /api/files /api/file /api/generate-setup /api/develop-chapter）
  - `src/server/static.ts`：静态资源服务（public/）
  - `src/utils/http.ts`：HTTP 读 body、JSON 解析与响应
  - `src/utils/sse.ts`：SSE（Server-Sent Events）流式日志
  - `src/utils/structuredOutput.ts`：从模型输出中截取标记块/JSON

---

## 7. 我想改某个部分，该从哪里改？

把“想改什么”映射成“该改哪里”，通常是最快的上手方式：

### 7.1 想改整体写作风格/原则（长期不变的规则）

改：`novel-engine/prompts/axis/*.md`

- Axis 文件会被全部拼接成 system prompt；越靠后越像“输出协议/格式要求”
- 如果你新增/改名 axis 文件，别忘了同步 `novel-engine/src/prompts/promptLoader.ts` 里的文件列表与顺序

### 7.2 想改某一步的输入要求/输出格式（最常改）

改：`novel-engine/prompts/tasks/**`

典型例子：

- brief 不够“可执行”：改 `tasks/chapter/generate_chapter_brief.md`
- 正文太啰嗦/不带推进：改 `tasks/chapter/write_chapter.md`
- QC 太宽松：改 `tasks/chapter/qc_and_rewrite.md`
- 更新主文件不稳定：改 `tasks/chapter/update_main_files.md`（尤其是 JSON schema 与“changed/ reason/content”）

### 7.3 想改主文件的结构骨架（模板）

改：`novel-engine/templates/*.template.md`

对应关系在：`novel-engine/src/workflows/generateSetup.ts`

### 7.4 想改“工作流顺序/新增一步/删一步”

改：

- Setup：`novel-engine/src/workflows/generateSetup.ts`
- Chapter：`novel-engine/src/workflows/developChapter.ts`

例如：

- 想在写正文前多一步“场景清单/节奏检查”：在 `developChapter.ts` 里插入新步骤，并新增 `prompts/tasks/chapter/xxx.md`
- 想把“更新主文件”拆成多步：同上，同时调整输出 JSON 的解析与写入

### 7.5 想改“哪些文件算主文件 / 新增一个主文件”

改：

- `novel-engine/src/novel/pathing.ts` 的 `CORE_FILES`
- Setup 的映射：`novel-engine/src/workflows/generateSetup.ts`
- Chapter 的更新逻辑：`novel-engine/src/workflows/developChapter.ts`（循环写入 core files）
- UI 里勾选项与默认展示：`novel-engine/public/index.html` + `novel-engine/public/app.js`

### 7.6 想改章节命名规则/编号规则/summary 规则

改：`novel-engine/src/novel/chapters.ts`

### 7.7 想改 API / 前端交互

改：

- API：`novel-engine/src/server/router.ts`
- 前端：`novel-engine/public/app.js`
- 页面/文案/布局：`novel-engine/public/index.html`、`novel-engine/public/style.css`

### 7.8 想改默认模型与温度、或增加更多配置项

改：

- 配置读取：`novel-engine/src/config.ts`
- 配置文件：`novel-engine/config.example.json`
- 业务用到的默认值：`novel-engine/src/workflows/*`

---

## 8. 调试与排错（你会最常遇到的）

- 提示 `OPENAI_API_KEY missing`：设置 env `OPENAI_API_KEY` 或配置 `novel-engine/config.json`
- 章节流程提示缺少主文件：先跑 Setup，或手工创建 4 个主文件（见 `CORE_FILES`）
- QC/Update 报 “did not return marked JSON.”：大概率是对应 task prompt 没按 `<<<JSON ... JSON>>>` 协议输出；先检查 `prompts/tasks/chapter/qc_and_rewrite.md` 与 `update_main_files.md`
- 文件读写失败（路径越界）：服务端会校验 `/api/file` 的 path 不能逃出 `novelRoot`（见 `ensureWithinRoot` / `safeUserPath`）

