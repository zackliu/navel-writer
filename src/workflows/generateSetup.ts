import path from "node:path";

import type { AppConfig } from "../config.js";
import { openaiChatCompletion } from "../llm/openaiChat.js";
import { loadAxisPrompts, loadTaskPrompt, loadTemplate } from "../prompts/promptLoader.js";
import { CORE_FILES, draftsDir, novelPath, type CoreFileName } from "../novel/pathing.js";
import { copyIfExists, readUtf8IfExists, writeUtf8 } from "../novel/files.js";
import { appendStep, createRun, updateOutputs } from "../runs/runStore.js";
import { extractJsonFromMarkedBlock } from "../utils/structuredOutput.js";

type Logger = ((evt: { event: string; data: unknown }) => void) | null | undefined;

const GENERATION_ORDER: CoreFileName[] = ["bible.md", "characters.md", "continuity_log.md", "outline.md"];

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

function wrapFile(name: string, content: string | null | undefined): string {
  if (!content) return "";
  return `\n\n---\n\n## FILE: ${name}\n${content}`;
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
  const subset = GENERATION_ORDER.filter((f) => requestedFiles.includes(f));
  const orderedFiles: CoreFileName[] = subset.length ? subset : [...GENERATION_ORDER];

  const run = await createRun({
    novelRoot: config.novelRoot,
    type: "setup",
    input: { requirements, files: requestedFiles, modelsByFile, writeMode },
  });

  const axis = await loadAxisPrompts({ engineRoot });

  const outputs: Record<string, unknown> = {};
  const existingByFile: Record<CoreFileName, string | null> = {
    "bible.md": null,
    "characters.md": null,
    "continuity_log.md": null,
    "outline.md": null,
  };
  for (const fileName of GENERATION_ORDER) {
    existingByFile[fileName] = await readUtf8IfExists(
      novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
    );
  }

  const generated: Record<CoreFileName, string> = {
    "bible.md": "",
    "characters.md": "",
    "continuity_log.md": "",
    "outline.md": "",
  };
  const targetPaths: Record<CoreFileName, string> = {
    "bible.md": "",
    "characters.md": "",
    "continuity_log.md": "",
    "outline.md": "",
  };

  for (const fileName of orderedFiles) {
    const model =
      (modelsByFile && modelsByFile[fileName]) || config.defaults.models.setup;
    const effectiveTemp =
      typeof temperature === "number"
        ? temperature
        : config.defaults.temperature.setup;

    const priorFiles = GENERATION_ORDER.slice(0, GENERATION_ORDER.indexOf(fileName)).map(
      (name) => ({
        name,
        content: generated[name] || existingByFile[name],
      })
    );

    const taskPrompt = await loadTaskPrompt({
      engineRoot,
      relativePath: taskPromptForFile(fileName),
    });
    const template = await loadTemplate({ engineRoot, name: templateForFile(fileName) });

    const existing = existingByFile[fileName];
    const priorContext = priorFiles
      .map(({ name, content }) => wrapFile(name, content))
      .filter(Boolean)
      .join("");

    const userContent = [
      taskPrompt,
      "\n\n---\n\n## 用户需求\n",
      requirements ? String(requirements) : "(未提供)",
      "\n\n---\n\n## 模板\n",
      template,
      existing ? `\n\n---\n\n## 现有 ${fileName}\n${existing}` : "",
      priorContext ? `\n\n---\n\n## 已生成的上游核心文件\n${priorContext}` : "",
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
    generated[fileName] = markdown;

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
    targetPaths[fileName] = target;

    outputs[fileName] = {
      path: target,
      model,
      usage: result.usage,
      wroteMode: writeMode,
    };

    log?.({ event: "result", data: { file: fileName, path: target } });
  }

  // Setup QC pass to ensure the four files are synced.
  const qcModel = config.defaults.models.qc || config.defaults.models.setup;
  const qcTemperature = config.defaults.temperature.qc ?? config.defaults.temperature.setup ?? 0.2;
  const qcPrompt = await loadTaskPrompt({
    engineRoot,
    relativePath: "tasks/setup/qc_setup.md",
  });

  const qcUserContent = [
    qcPrompt,
    wrapFile("requirements", requirements ? String(requirements) : "(none)"),
    ...GENERATION_ORDER.map((fileName) =>
      wrapFile(fileName, generated[fileName] || existingByFile[fileName] || "")
    ),
  ].join("\n\n");

  log?.({ event: "status", data: { step: "setup_qc", model: qcModel } });
  await appendStep({
    runDir: run.dir,
    step: { kind: "llm", step: "setup_qc", model: qcModel, temperature: qcTemperature },
  });

  const qcResult = await openaiChatCompletion({
    apiKey: config.openai.apiKey,
    baseUrl: config.openai.baseUrl,
    model: qcModel,
    messages: [
      { role: "system", content: axis },
      { role: "user", content: qcUserContent },
    ],
    temperature: qcTemperature,
  });

  const qcJson = extractJsonFromMarkedBlock(qcResult.text);
  if (!qcJson || typeof qcJson !== "object" || typeof (qcJson as any).files !== "object") {
    throw new Error("Setup QC did not return expected JSON.");
  }

  outputs["setupQc"] = {
    model: qcModel,
    usage: qcResult.usage,
    conclusion: String((qcJson as any).conclusion || ""),
  };

  for (const fileName of GENERATION_ORDER) {
    const spec = (qcJson as any).files?.[fileName];
    if (!spec || typeof spec !== "object") continue;

    const changed = Boolean(spec.changed);
    const reason = String(spec.reason || "");
    const newContent = changed ? String(spec.content || "") : generated[fileName];
    if (!newContent || !newContent.trim()) {
      if (changed) throw new Error(`Setup QC returned empty content for ${fileName}.`);
      continue;
    }

    const normalized = newContent.replace(/\r\n/g, "\n").trimEnd() + "\n";
    generated[fileName] = normalized;

    if (changed) {
      const target = targetPaths[fileName] ||
        (writeMode === "overwrite"
          ? novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
          : path.join(draftsDir(config.novelRoot), run.id, fileName));
      await writeUtf8({ filePath: target, content: normalized });
      targetPaths[fileName] = target;
      log?.({ event: "result", data: { file: fileName, path: target, from: "setup_qc", reason } });
    }

    outputs[fileName] = {
      ...(outputs[fileName] as any),
      path: targetPaths[fileName],
      qc: { changed, reason },
    };
  }

  await updateOutputs({ runDir: run.dir, outputs });

  return { runId: run.id, outputs };
}
