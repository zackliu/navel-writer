import path from "node:path";

import type { AppConfig } from "../config.js";
import { openaiChatCompletion } from "../llm/openaiChat.js";
import { loadAxisPrompts, loadTaskPrompt, loadTemplate } from "../prompts/promptLoader.js";
import { CORE_FILES, draftsDir, novelPath, type CoreFileName } from "../novel/pathing.js";
import { copyIfExists, readUtf8IfExists, writeUtf8 } from "../novel/files.js";
import { appendStep, createRun, updateOutputs } from "../runs/runStore.js";
import { extractJsonFromMarkedBlock } from "../utils/structuredOutput.js";

type Logger = ((evt: { event: string; data: unknown }) => void) | null | undefined;

type SetupMode = "full" | "incremental";

const GENERATION_ORDER: CoreFileName[] = ["bible.md", "characters.md", "outline.md", "continuity_log.md"];

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

function wrapSection(title: string, content: string | null | undefined): string {
  if (content == null) return "";
  return `\n\n---\n\n## ${title}\n${content}`;
}

function normalizeMode(mode: unknown): SetupMode {
  return mode === "incremental" ? "incremental" : "full";
}

function normalizeTargetFile(target: unknown): CoreFileName {
  const cleaned = String(target || "").trim();
  if ((CORE_FILES as readonly string[]).includes(cleaned)) {
    return cleaned as CoreFileName;
  }
  throw new Error("Invalid or missing targetFile for incremental setup.");
}

function normalizeContextFiles(contextFiles: unknown, target: CoreFileName): CoreFileName[] {
  const list = Array.isArray(contextFiles) ? contextFiles.map(String) : [];
  const filtered = list.filter((f): f is CoreFileName => (CORE_FILES as readonly string[]).includes(f));
  const set = new Set<CoreFileName>(filtered);
  set.add(target);
  return Array.from(set);
}

async function runIncrementalSetup({
  config,
  engineRoot,
  axis,
  runId,
  runDir,
  targetFile,
  contextFiles,
  instructions,
  modelsByFile,
  writeMode,
  temperature,
  log,
}: {
  config: AppConfig;
  engineRoot: string;
  axis: string;
  runId: string;
  runDir: string;
  targetFile: CoreFileName;
  contextFiles: CoreFileName[];
  instructions: string;
  modelsByFile?: Partial<Record<CoreFileName, string>>;
  writeMode: "draft" | "overwrite";
  temperature?: number;
  log?: Logger;
}): Promise<Record<string, unknown>> {
  const model =
    (modelsByFile && modelsByFile[targetFile]) ||
    config.defaults.models.update ||
    config.defaults.models.setup;
  const effectiveTemp =
    typeof temperature === "number"
      ? temperature
      : config.defaults.temperature.setup;
  const reasoning = config.defaults.reasoning.setup ?? null;

  const existingByFile: Record<CoreFileName, string | null> = {
    "bible.md": null,
    "characters.md": null,
    "outline.md": null,
    "continuity_log.md": null,
  };
  for (const fileName of contextFiles) {
    existingByFile[fileName] = await readUtf8IfExists(
      novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
    );
  }

  const targetExisting = existingByFile[targetFile];
  if (targetExisting == null) {
    throw new Error(`Target file not found: ${targetFile}. Please generate it first.`);
  }

  const updatePrompt = await loadTaskPrompt({
    engineRoot,
    relativePath: "tasks/setup/update_core_file.md",
  });

  const contextBlocks = contextFiles
    .map((name) => {
      const label = name === targetFile ? `${name} (current)` : name;
      const content = existingByFile[name];
      if (content == null) return wrapSection(`FILE: ${label}`, "(missing)");
      return `\n\n---\n\n## FILE: ${label}\n${content}`;
    })
    .join("");

  const userContent = [
    updatePrompt,
    wrapSection("Target File", targetFile),
    wrapSection("Instructions", instructions ? String(instructions) : "(none provided)"),
    contextBlocks,
  ].join("");

  log?.({ event: "status", data: { step: "incremental_setup", file: targetFile, model } });
  await appendStep({
    runDir,
    step: { kind: "llm", step: "incremental_setup", file: targetFile, model, temperature: effectiveTemp },
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
    reasoningEffort: reasoning,
  });

  const markdown = result.text.trim().replace(/\r\n/g, "\n") + "\n";

  const target =
    writeMode === "overwrite"
      ? novelPath({ novelRoot: config.novelRoot, relativePath: targetFile })
      : path.join(draftsDir(config.novelRoot), runId, targetFile);

  if (writeMode === "overwrite") {
    await copyIfExists({
      from: target,
      to: path.join(runDir, "backup", targetFile),
    });
  }

  await writeUtf8({ filePath: target, content: markdown });

  log?.({ event: "result", data: { file: targetFile, path: target } });

  return {
    [targetFile]: {
      path: target,
      model,
      usage: result.usage,
      wroteMode: writeMode,
      mode: "incremental",
      contextFiles,
    },
  };
}

export async function generateSetup({
  config,
  engineRoot,
  requirements,
  files,
  modelsByFile,
  writeMode = "overwrite",
  mode,
  targetFile,
  contextFiles,
  temperature,
  log,
}: {
  config: AppConfig;
  engineRoot: string;
  requirements: string;
  files?: unknown;
  modelsByFile?: Partial<Record<CoreFileName, string>>;
  mode?: SetupMode;
  targetFile?: unknown;
  contextFiles?: unknown;
  writeMode?: "draft" | "overwrite";
  temperature?: number;
  log?: Logger;
}): Promise<{ runId: string; outputs: Record<string, unknown> }> {
  const setupMode = normalizeMode(mode);
  const resolvedWriteMode: "draft" | "overwrite" =
    setupMode === "incremental" ? (writeMode || "draft") : writeMode || "overwrite";

  const requestedFiles = normalizeFiles(files);
  const subset = GENERATION_ORDER.filter((f) => requestedFiles.includes(f));
  const orderedFiles: CoreFileName[] = subset.length ? subset : [...GENERATION_ORDER];

  const run = await createRun({
    novelRoot: config.novelRoot,
    type: "setup",
    input: {
      requirements,
      files: requestedFiles,
      modelsByFile,
      writeMode: resolvedWriteMode,
      mode: setupMode,
      targetFile,
      contextFiles,
    },
  });

  const axis = await loadAxisPrompts({ engineRoot, kind: "setup" });

  if (setupMode === "incremental") {
    const normalizedTarget = normalizeTargetFile(targetFile);
    const normalizedContext = normalizeContextFiles(contextFiles, normalizedTarget);
    const outputs = await runIncrementalSetup({
      config,
      engineRoot,
      axis,
      runId: run.id,
      runDir: run.dir,
      targetFile: normalizedTarget,
      contextFiles: normalizedContext,
      instructions: requirements || "",
      modelsByFile,
      writeMode: resolvedWriteMode,
      temperature,
      log,
    });
    await updateOutputs({ runDir: run.dir, outputs });
    return { runId: run.id, outputs };
  }

  const outputs: Record<string, unknown> = {};
  const existingByFile: Record<CoreFileName, string | null> = {
    "bible.md": null,
    "characters.md": null,
    "outline.md": null,
    "continuity_log.md": null,
  };
  for (const fileName of GENERATION_ORDER) {
    existingByFile[fileName] = await readUtf8IfExists(
      novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
    );
  }

  const generated: Record<CoreFileName, string> = {
    "bible.md": "",
    "characters.md": "",
    "outline.md": "",
    "continuity_log.md": "",
  };
  const targetPaths: Record<CoreFileName, string> = {
    "bible.md": "",
    "characters.md": "",
    "outline.md": "",
    "continuity_log.md": "",
  };
  let outlineQcPath: string | null = null;
  let outlineQcUsage: unknown = null;

  for (const fileName of orderedFiles) {
    const model =
      (modelsByFile && modelsByFile[fileName]) || config.defaults.models.setup;
    const effectiveTemp =
      typeof temperature === "number"
        ? temperature
        : config.defaults.temperature.setup;
    const reasoning = config.defaults.reasoning.setup ?? null;

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
      reasoningEffort: reasoning,
    });

    const markdown = result.text.trim().replace(/\r\n/g, "\n") + "\n";
    generated[fileName] = markdown;

    const target =
      resolvedWriteMode === "overwrite"
        ? novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
        : path.join(draftsDir(config.novelRoot), run.id, fileName);

    if (resolvedWriteMode === "overwrite") {
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
      wroteMode: resolvedWriteMode,
    };

    log?.({ event: "result", data: { file: fileName, path: target } });

    // For full outline generation, run a dedicated QC pass and rewrite once using the QC checklist.
    if (setupMode === "full" && fileName === "outline.md") {
      const outlineQcPrompt = await loadTaskPrompt({
        engineRoot,
        relativePath: "tasks/setup/qc_outline.md",
      });
      const outlineRewritePrompt = await loadTaskPrompt({
        engineRoot,
        relativePath: "tasks/setup/rewrite_outline_with_qc.md",
      });

      const outlineQcUserContent = [
        outlineQcPrompt,
        wrapFile("requirements", requirements ? String(requirements) : "(none)"),
        wrapFile("outline.md", markdown),
        wrapFile("bible.md", generated["bible.md"] || existingByFile["bible.md"]),
        wrapFile("characters.md", generated["characters.md"] || existingByFile["characters.md"]),
        wrapFile("continuity_log.md", generated["continuity_log.md"] || existingByFile["continuity_log.md"]),
      ].join("");

      const outlineQcModel = config.defaults.models.qc || model;
      const outlineQcTemp = config.defaults.temperature.qc ?? effectiveTemp;

      log?.({ event: "status", data: { step: "outline_qc", model: outlineQcModel } });
      await appendStep({
        runDir: run.dir,
        step: { kind: "llm", step: "outline_qc", model: outlineQcModel, temperature: outlineQcTemp },
      });

      const outlineQcResult = await openaiChatCompletion({
        apiKey: config.openai.apiKey,
        baseUrl: config.openai.baseUrl,
        model: outlineQcModel,
        messages: [
          { role: "system", content: axis },
          { role: "user", content: outlineQcUserContent },
        ],
        temperature: outlineQcTemp,
        reasoningEffort: config.defaults.reasoning.setup ?? null,
      });

      const outlineQcJson = extractJsonFromMarkedBlock(outlineQcResult.text);
      if (!outlineQcJson || typeof outlineQcJson !== "object") {
        throw new Error("Outline QC did not return expected JSON.");
      }

      const qcMarkdown = String((outlineQcJson as any).qcMarkdown || "").replace(/\r\n/g, "\n").trim();
      if (!qcMarkdown) throw new Error("Outline QC returned empty qcMarkdown.");

      outlineQcPath = novelPath({ novelRoot: config.novelRoot, relativePath: "outline_qc.md" });
      const qcContent = `## Outline QC pass 1\n\n${qcMarkdown}\n`;
      await writeUtf8({ filePath: outlineQcPath, content: qcContent });
      outlineQcUsage = outlineQcResult.usage;
      log?.({ event: "result", data: { file: "outline_qc.md", path: outlineQcPath, pass: 1 } });

      const outlineRewriteUserContent = [
        outlineRewritePrompt,
        wrapFile("outline.md", markdown),
        wrapFile("outline_qc.md", qcContent),
        wrapFile("bible.md", generated["bible.md"] || existingByFile["bible.md"]),
        wrapFile("characters.md", generated["characters.md"] || existingByFile["characters.md"]),
        wrapFile("continuity_log.md", generated["continuity_log.md"] || existingByFile["continuity_log.md"]),
      ].join("");

      const outlineRewriteModel = model;
      const outlineRewriteTemp = effectiveTemp;

      log?.({ event: "status", data: { step: "outline_rewrite_after_qc", model: outlineRewriteModel } });
      await appendStep({
        runDir: run.dir,
        step: {
          kind: "llm",
          step: "outline_rewrite_after_qc",
          model: outlineRewriteModel,
          temperature: outlineRewriteTemp,
        },
      });

      const outlineRewriteResult = await openaiChatCompletion({
        apiKey: config.openai.apiKey,
        baseUrl: config.openai.baseUrl,
        model: outlineRewriteModel,
        messages: [
          { role: "system", content: axis },
          { role: "user", content: outlineRewriteUserContent },
        ],
        temperature: outlineRewriteTemp,
        reasoningEffort: config.defaults.reasoning.setup ?? null,
      });

      const rewrittenOutline = outlineRewriteResult.text.trim().replace(/\r\n/g, "\n") + "\n";
      generated["outline.md"] = rewrittenOutline;
      await writeUtf8({ filePath: target, content: rewrittenOutline });
      targetPaths["outline.md"] = target;
      outputs["outline.md"] = {
        ...(outputs["outline.md"] as any),
        path: target,
        model: outlineRewriteModel,
        usage: outlineRewriteResult.usage,
        qc: { changed: true, reason: "outline_qc", qcPath: outlineQcPath },
      };
      log?.({ event: "result", data: { file: "outline.md", path: target, from: "outline_rewrite_after_qc" } });
    }
  }

  // Setup QC pass to ensure the four files are synced.
  // const qcModel = config.defaults.models.qc || config.defaults.models.setup;
  // const qcTemperature = config.defaults.temperature.qc ?? config.defaults.temperature.setup ?? 0.2;
  // const qcReasoning = config.defaults.reasoning.setup ?? null;
  // const qcPrompt = await loadTaskPrompt({
  //   engineRoot,
  //   relativePath: "tasks/setup/qc_setup.md",
  // });

  // const qcUserContent = [
  //   qcPrompt,
  //   wrapFile("requirements", requirements ? String(requirements) : "(none)"),
  //   ...GENERATION_ORDER.map((fileName) =>
  //     wrapFile(fileName, generated[fileName] || existingByFile[fileName] || "")
  //   ),
  // ].join("\n\n");

  // log?.({ event: "status", data: { step: "setup_qc", model: qcModel } });
  // await appendStep({
  //   runDir: run.dir,
  //   step: { kind: "llm", step: "setup_qc", model: qcModel, temperature: qcTemperature },
  // });

  // const qcResult = await openaiChatCompletion({
  //   apiKey: config.openai.apiKey,
  //   baseUrl: config.openai.baseUrl,
  //   model: qcModel,
  //   messages: [
  //     { role: "system", content: axis },
  //     { role: "user", content: qcUserContent },
  //   ],
  //   temperature: qcTemperature,
  //   reasoningEffort: qcReasoning,
  // });

  // const qcJson = extractJsonFromMarkedBlock(qcResult.text);
  // if (!qcJson || typeof qcJson !== "object" || typeof (qcJson as any).files !== "object") {
  //   throw new Error("Setup QC did not return expected JSON.");
  // }

  // outputs["setupQc"] = {
  //   model: qcModel,
  //   usage: qcResult.usage,
  //   conclusion: String((qcJson as any).conclusion || ""),
  // };

  // for (const fileName of GENERATION_ORDER) {
  //   const spec = (qcJson as any).files?.[fileName];
  //   if (!spec || typeof spec !== "object") continue;

  //   const changed = Boolean(spec.changed);
  //   const reason = String(spec.reason || "");
  //   const newContent = changed ? String(spec.content || "") : generated[fileName];
  //   if (!newContent || !newContent.trim()) {
  //     if (changed) throw new Error(`Setup QC returned empty content for ${fileName}.`);
  //     continue;
  //   }

  //   const normalized = newContent.replace(/\r\n/g, "\n").trimEnd() + "\n";
  //   generated[fileName] = normalized;

  //   if (changed) {
  //     const target = targetPaths[fileName] ||
  //       (resolvedWriteMode === "overwrite"
  //         ? novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
  //         : path.join(draftsDir(config.novelRoot), run.id, fileName));
  //     await writeUtf8({ filePath: target, content: normalized });
  //     targetPaths[fileName] = target;
  //     log?.({ event: "result", data: { file: fileName, path: target, from: "setup_qc", reason } });
  //   }

  //   outputs[fileName] = {
  //     ...(outputs[fileName] as any),
  //     path: targetPaths[fileName],
  //     qc: { changed, reason },
  //   };
  // }

  // await updateOutputs({ runDir: run.dir, outputs });

  return { runId: run.id, outputs };
}
