import path from "node:path";

import type { AppConfig } from "../config.js";
import { openaiChatCompletion } from "../llm/openaiChat.js";
import { loadAxisPrompts, loadTaskPrompt, loadTemplate } from "../prompts/promptLoader.js";
import { CORE_FILES, draftsDir, novelPath, type CoreFileName } from "../novel/pathing.js";
import { copyIfExists, readUtf8IfExists, writeUtf8 } from "../novel/files.js";
import { appendStep, createRun, updateOutputs } from "../runs/runStore.js";

type Logger = ((evt: { event: string; data: unknown }) => void) | null | undefined;

function normalizeFiles(files: unknown): CoreFileName[] {
  const requested: string[] =
    Array.isArray(files) && files.length ? files.map(String) : [...CORE_FILES];
  const cleaned = requested
    .map((f) => String(f).trim())
    .filter((f): f is CoreFileName => (CORE_FILES as readonly string[]).includes(f));
  return [...new Set(cleaned)];
}

function taskPromptForFile(fileName: CoreFileName): string {
  switch (fileName) {
    case "bible.md":
      return "tasks/setup/generate_bible.md";
    case "characters.md":
      return "tasks/setup/generate_characters.md";
    case "outline.md":
      return "tasks/setup/generate_outline.md";
    case "continuity_log.md":
      return "tasks/setup/generate_continuity_log.md";
    default:
      throw new Error(`Unsupported file: ${fileName}`);
  }
}

function templateForFile(fileName: CoreFileName): string {
  switch (fileName) {
    case "bible.md":
      return "bible.template.md";
    case "characters.md":
      return "characters.template.md";
    case "outline.md":
      return "outline.template.md";
    case "continuity_log.md":
      return "continuity_log.template.md";
    default:
      throw new Error(`Unsupported file: ${fileName}`);
  }
}

export async function generateSetup({
  config,
  engineRoot,
  requirements,
  files,
  modelsByFile,
  writeMode = "draft",
  temperature,
  log,
}: {
  config: AppConfig;
  engineRoot: string;
  requirements: string;
  files?: unknown;
  modelsByFile?: Partial<Record<CoreFileName, string>>;
  writeMode?: "draft" | "overwrite";
  temperature?: number;
  log?: Logger;
}): Promise<{ runId: string; outputs: Record<string, unknown> }> {
  const requestedFiles = normalizeFiles(files);

  const run = await createRun({
    novelRoot: config.novelRoot,
    type: "setup",
    input: { requirements, files: requestedFiles, modelsByFile, writeMode },
  });

  const axis = await loadAxisPrompts({ engineRoot });

  const outputs: Record<string, unknown> = {};

  for (const fileName of requestedFiles) {
    const model =
      (modelsByFile && modelsByFile[fileName]) || config.defaults.models.setup;
    const effectiveTemp =
      typeof temperature === "number"
        ? temperature
        : config.defaults.temperature.setup;

    const taskPrompt = await loadTaskPrompt({
      engineRoot,
      relativePath: taskPromptForFile(fileName),
    });
    const template = await loadTemplate({ engineRoot, name: templateForFile(fileName) });

    const existing = await readUtf8IfExists(
      novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
    );

    const userContent = [
      taskPrompt,
      "\n\n---\n\n## 用户需求\n",
      requirements ? String(requirements) : "(未提供)",
      "\n\n---\n\n## 模板\n",
      template,
      existing
        ? `\n\n---\n\n## 现有 ${fileName}（如需保持结构/不必要部分不改，可参考）\n${existing}`
        : "",
    ].join("");

    log?.({ event: "status", data: { step: "llm", file: fileName, model } });
    await appendStep({
      runDir: run.dir,
      step: { kind: "llm", file: fileName, model, temperature: effectiveTemp },
    });

    const result = await openaiChatCompletion({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model,
      messages: [
        { role: "system", content: axis },
        { role: "user", content: userContent },
      ],
      temperature: effectiveTemp,
    });

    const markdown = result.text.trim().replace(/\r\n/g, "\n") + "\n";

    const target =
      writeMode === "overwrite"
        ? novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
        : path.join(draftsDir(config.novelRoot), run.id, fileName);

    if (writeMode === "overwrite") {
      await copyIfExists({
        from: target,
        to: path.join(run.dir, "backup", fileName),
      });
    }

    await writeUtf8({ filePath: target, content: markdown });

    outputs[fileName] = {
      path: target,
      model,
      usage: result.usage,
      wroteMode: writeMode,
    };

    log?.({ event: "result", data: { file: fileName, path: target } });
  }

  await updateOutputs({ runDir: run.dir, outputs });

  return { runId: run.id, outputs };
}
