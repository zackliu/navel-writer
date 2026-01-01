import path from "node:path";

import type { AppConfig } from "../config.js";
import { openaiChatCompletion } from "../llm/openaiChat.js";
import { loadAxisPrompts, loadTaskPrompt } from "../prompts/promptLoader.js";
import { CORE_FILES, novelPath, type CoreFileName } from "../novel/pathing.js";
import { copyIfExists, readUtf8IfExists, writeUtf8 } from "../novel/files.js";
import {
  listChapterNumbers,
  parseSummaryUpTo,
  readChapter,
  readChapterBrief,
  readSummary,
  writeChapter,
  writeChapterBrief,
  writeChapterQc,
  writeSummary,
  chapterBriefFileName,
} from "../novel/chapters.js";
import { extractJsonFromMarkedBlock } from "../utils/structuredOutput.js";
import { appendStep, createRun, updateOutputs } from "../runs/runStore.js";

type Logger = ((evt: { event: string; data: unknown }) => void) | null | undefined;

function countCharsNoSpace(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function wrapFile(name: string, content: string | null): string {
  return `\n\n=== FILE: ${name} ===\n${content || ""}\n=== END FILE: ${name} ===\n`;
}

async function requireCoreFiles({ novelRoot }: { novelRoot: string }): Promise<Record<CoreFileName, string>> {
  const map = {} as Record<CoreFileName, string>;
  for (const fileName of CORE_FILES) {
    const abs = novelPath({ novelRoot, relativePath: fileName });
    const content = await readUtf8IfExists(abs);
    if (!content) {
      throw new Error(`Missing core file: ${fileName}. Run setup generation first (or create it manually).`);
    }
    map[fileName] = content;
  }
  return map;
}

function pickModels({ config, models }: { config: AppConfig; models?: any }) {
  return {
    summary: models?.summary || config.defaults.models.summary,
    brief: models?.brief || config.defaults.models.brief,
    write: models?.write || config.defaults.models.write,
    qc: models?.qc || config.defaults.models.qc,
    update: models?.update || config.defaults.models.update,
  };
}

function pickTemps({ config, temperatures }: { config: AppConfig; temperatures?: any }) {
  const t = temperatures || {};
  return {
    summary: typeof t.summary === "number" ? t.summary : config.defaults.temperature.summary,
    brief: typeof t.brief === "number" ? t.brief : config.defaults.temperature.brief,
    write: typeof t.write === "number" ? t.write : config.defaults.temperature.write,
    qc: typeof t.qc === "number" ? t.qc : config.defaults.temperature.qc,
    update: typeof t.update === "number" ? t.update : config.defaults.temperature.update,
  };
}

async function buildSummaryIfNeeded({
  config,
  engineRoot,
  axis,
  coreFiles,
  priorChapterNumbers,
  models,
  temps,
  log,
  runDir,
}: {
  config: AppConfig;
  engineRoot: string;
  axis: string;
  coreFiles: Record<CoreFileName, string>;
  priorChapterNumbers: number[];
  models: { summary: string };
  temps: { summary: number };
  log: Logger;
  runDir: string;
}): Promise<{ summaryMarkdown: string | null; summaryPath: string | null; summaryUpTo: number | null }> {
  if (priorChapterNumbers.length <= 3) {
    return { summaryMarkdown: null, summaryPath: null, summaryUpTo: null };
  }

  const older = priorChapterNumbers.slice(0, -3);
  const summaryUpTo = older[older.length - 1];

  const existingSummary = await readSummary({ novelRoot: config.novelRoot });
  const existingUpTo = parseSummaryUpTo(existingSummary);
  if (existingSummary && existingUpTo === summaryUpTo) {
    return { summaryMarkdown: existingSummary, summaryPath: null, summaryUpTo };
  }

  const summarizePrompt = await loadTaskPrompt({
    engineRoot,
    relativePath: "tasks/chapter/summarize_older_chapters.md",
  });

  const olderChapters = [];
  for (const n of older) {
    const content = await readChapter({ novelRoot: config.novelRoot, n });
    if (!content) continue;
    olderChapters.push(wrapFile(`chapters/chapter_${String(n).padStart(2, "0")}.md`, content));
  }

  const userContent = [
    summarizePrompt,
    wrapFile("bible.md", coreFiles["bible.md"]),
    wrapFile("characters.md", coreFiles["characters.md"]),
    wrapFile("outline.md", coreFiles["outline.md"]),
    wrapFile("continuity_log.md", coreFiles["continuity_log.md"]),
    "\n\n---\n\n## 旧章节正文（需要被压缩）\n",
    olderChapters.join("\n"),
  ].join("");

  log?.({ event: "status", data: { step: "summary", model: models.summary, upTo: summaryUpTo } });
  await appendStep({
    runDir,
    step: { kind: "llm", step: "summary", model: models.summary, temperature: temps.summary },
  });

  const result = await openaiChatCompletion({
    apiKey: config.openai.apiKey,
    baseUrl: config.openai.baseUrl,
    model: models.summary,
    messages: [
      { role: "system", content: axis },
      { role: "user", content: userContent },
    ],
    temperature: temps.summary,
  });

  const summaryMarkdown =
    `<!-- summary_up_to: ${summaryUpTo} -->\n\n` +
    result.text.trim().replace(/\r\n/g, "\n") +
    "\n";

  const summaryPath = await writeSummary({ novelRoot: config.novelRoot, content: summaryMarkdown });
  log?.({ event: "result", data: { file: "chapters/_summary.md", path: summaryPath } });

  return { summaryMarkdown, summaryPath, summaryUpTo };
}

export async function developChapter({
  config,
  engineRoot,
  userGuidance,
  chapterNumber,
  qcPasses: qcPassesInput,
  models: modelsInput,
  temperatures,
  mainWriteMode = "overwrite",
  useExistingBrief: useExistingBriefInput = false,
  log,
}: {
  config: AppConfig;
  engineRoot: string;
  userGuidance: string;
  chapterNumber?: number;
  qcPasses?: number;
  models?: any;
  temperatures?: any;
  mainWriteMode?: "overwrite" | "draft";
  useExistingBrief?: boolean;
  log?: Logger;
}): Promise<{ runId: string; outputs: Record<string, unknown> }> {
  const requestedQcPasses =
    typeof qcPassesInput === "number" && Number.isFinite(qcPassesInput) ? qcPassesInput : null;
  const baseQcPasses = requestedQcPasses ?? config.defaults.chapterQcPasses ?? 1;
  const qcPasses = Math.max(1, Math.floor(baseQcPasses));
  const useExistingBrief = useExistingBriefInput === true;

  const run = await createRun({
    novelRoot: config.novelRoot,
    type: "chapter",
    input: { userGuidance, chapterNumber, models: modelsInput, mainWriteMode, qcPasses, useExistingBrief },
  });

  const models = pickModels({ config, models: modelsInput });
  const temps = pickTemps({ config, temperatures });

  const axis = await loadAxisPrompts({ engineRoot, kind: "chapter" });
  const coreFiles = await requireCoreFiles({ novelRoot: config.novelRoot });

  const existingChapterNumbers = await listChapterNumbers({ novelRoot: config.novelRoot });

  const nextChapter =
    typeof chapterNumber === "number" && Number.isFinite(chapterNumber)
      ? chapterNumber
      : (existingChapterNumbers[existingChapterNumbers.length - 1] || 0) + 1;

  const priorChapterNumbers = existingChapterNumbers.filter((n) => n < nextChapter);
  const recent = priorChapterNumbers.slice(-3);

  const recentChapters = [];
  for (const n of recent) {
    const content = await readChapter({ novelRoot: config.novelRoot, n });
    if (!content) continue;
    recentChapters.push(wrapFile(`chapters/chapter_${String(n).padStart(2, "0")}.md`, content));
  }

  // const { summaryMarkdown, summaryPath } = await buildSummaryIfNeeded({
  //   config,
  //   engineRoot,
  //   axis,
  //   coreFiles,
  //   priorChapterNumbers,
  //   models,
  //   temps,
  //   log,
  //   runDir: run.dir,
  // });

  const briefRelativePath = path.join("chapters", chapterBriefFileName(nextChapter));
  const briefAbsPath = novelPath({ novelRoot: config.novelRoot, relativePath: briefRelativePath });

  let briefMarkdown: string;
  let briefPath: string;

  if (useExistingBrief) {
    const existingBrief = await readChapterBrief({ novelRoot: config.novelRoot, n: nextChapter });
    if (!existingBrief) {
      throw new Error(
        `Existing brief not found for chapter ${nextChapter}: ${briefRelativePath}. Generate it first.`
      );
    }
    briefMarkdown = existingBrief.replace(/\r\n/g, "\n");
    if (!briefMarkdown.trim()) {
      throw new Error(`Existing brief for chapter ${nextChapter} is empty: ${briefRelativePath}`);
    }
    if (!briefMarkdown.endsWith("\n")) briefMarkdown += "\n";
    briefPath = briefAbsPath;
    log?.({ event: "status", data: { step: "brief", chapter: nextChapter, mode: "existing" } });
    await appendStep({
      runDir: run.dir,
      step: { kind: "info", step: "brief", mode: "existing", chapter: nextChapter },
    });
    log?.({ event: "result", data: { file: path.basename(briefPath), path: briefPath, mode: "existing" } });
  } else {
    const briefPrompt = await loadTaskPrompt({
      engineRoot,
      relativePath: "tasks/chapter/generate_chapter_brief.md",
    });

    const briefUserContent = [
      briefPrompt,
      wrapFile("bible.md", coreFiles["bible.md"]),
      wrapFile("characters.md", coreFiles["characters.md"]),
      wrapFile("outline.md", coreFiles["outline.md"]),
      wrapFile("continuity_log.md", coreFiles["continuity_log.md"]),
      // recentChapters.length ? "\n\n---\n\n## 最近 3 章全文\n" + recentChapters.join("\n") : "",
      "\n\n---\n\n## 本章信息\n",
      `目标章节号：${nextChapter}\n`,
      `用户本章额外要求：\n${userGuidance ? String(userGuidance) : "(无)"}\n`,
    ].join("");


    log?.({ event: "status", data: { step: "brief", chapter: nextChapter, model: models.brief } });
    await appendStep({
      runDir: run.dir,
      step: { kind: "llm", step: "brief", model: models.brief, temperature: temps.brief },
    });

    const briefResult = await openaiChatCompletion({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: models.brief,
      messages: [
        { role: "system", content: axis },
        { role: "user", content: briefUserContent },
      ],
      temperature: temps.brief,
    });

    briefMarkdown = briefResult.text.trim().replace(/\r\n/g, "\n") + "\n";
    briefPath = await writeChapterBrief({
      novelRoot: config.novelRoot,
      n: nextChapter,
      content: briefMarkdown,
    });
    log?.({ event: "result", data: { file: path.basename(briefPath), path: briefPath } });
  }
  const writePrompt = await loadTaskPrompt({
    engineRoot,
    relativePath: "tasks/chapter/write_chapter.md",
  });
  const writeUserContent = [
    writePrompt,
    wrapFile(path.basename(briefPath), briefMarkdown),
    wrapFile("bible.md", coreFiles["bible.md"]),
    wrapFile("characters.md", coreFiles["characters.md"]),
    // wrapFile("outline.md", coreFiles["outline.md"]),
    // wrapFile("continuity_log.md", coreFiles["continuity_log.md"]),
    // recentChapters.length ? "\n\n---\n\n## 最近 3 章全文\n" + recentChapters.join("\n") : "",
  ].join("");

  log?.({ event: "status", data: { step: "write", chapter: nextChapter, model: models.write } });
  await appendStep({
    runDir: run.dir,
    step: { kind: "llm", step: "write", model: models.write, temperature: temps.write },
  });

  console.warn({event:"output", data: writeUserContent})

  const chapterDraftResult = await openaiChatCompletion({
    apiKey: config.openai.apiKey,
    baseUrl: config.openai.baseUrl,
    model: models.write,
    messages: [
      { role: "system", content: axis },
      { role: "user", content: writeUserContent },
    ],
    temperature: temps.write,
  });

  let currentDraft = chapterDraftResult.text.trim().replace(/\r\n/g, "\n") + "\n";
  let currentDraftCharCount = countCharsNoSpace(currentDraft);
  const chapterPath = await writeChapter({
    novelRoot: config.novelRoot,
    n: nextChapter,
    content: currentDraft,
  });
  log?.({ event: "result", data: { file: path.basename(chapterPath), path: chapterPath } });

  const qcPrompt = await loadTaskPrompt({
    engineRoot,
    relativePath: "tasks/chapter/qc_and_rewrite.md",
  });
  const rewritePrompt = await loadTaskPrompt({
    engineRoot,
    relativePath: "tasks/chapter/rewrite_with_qc.md",
  });
  const chapterBaseName = path.basename(chapterPath, ".md");
  const qcHistory: string[] = [];
  let combinedQcMarkdown = "";
  let qcPath: string | null = null;
  let lastQcResult: any = null;
  let lastRewriteResult: any = null;

  for (let pass = 1; pass <= qcPasses; pass += 1) {
    const qcUserContentParts = [
      qcPrompt,
      wrapFile(path.basename(briefPath), briefMarkdown),
      wrapFile(path.basename(chapterPath), currentDraft),
    ];

    if (qcHistory.length) {
      const qcHistoryWrapped = qcHistory
        .map((qc, idx) => wrapFile(`${chapterBaseName}_qc_pass_${idx + 1}.md`, qc))
        .join("");
      qcUserContentParts.push("\n\n---\n\n## 历史 QC 记录（按时间顺序）\n", qcHistoryWrapped);
    }

    qcUserContentParts.push("\n\n=== 草稿长度（去空白字符） ===\n", String(currentDraftCharCount));

    const qcUserContent = qcUserContentParts.join("");

    log?.({
      event: "status",
      data: { step: "chapter_qc", chapter: nextChapter, pass, totalPasses: qcPasses, model: models.qc },
    });
    await appendStep({
      runDir: run.dir,
      step: {
        kind: "llm",
        step: "chapter_qc",
        chapter: nextChapter,
        pass,
        totalPasses: qcPasses,
        model: models.qc,
        temperature: temps.qc,
      },
    });

    const qcResult = await openaiChatCompletion({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: models.qc,
      messages: [
        { role: "system", content: axis },
        { role: "user", content: qcUserContent },
      ],
      temperature: temps.qc,
    });
    lastQcResult = qcResult;

    const qcJson = extractJsonFromMarkedBlock(qcResult.text);
    if (!qcJson || typeof qcJson !== "object") {
      throw new Error("Chapter QC did not return expected JSON.");
    }

    const qcMarkdown = String((qcJson as any).qcMarkdown || "").replace(/\r\n/g, "\n").trim();
    if (!qcMarkdown) throw new Error("Chapter QC returned empty qcMarkdown.");

    const qcEntry = `## QC pass ${pass}\n\n${qcMarkdown}\n`;
    qcHistory.push(qcEntry);
    combinedQcMarkdown = qcHistory.join("\n---\n\n");

    qcPath = await writeChapterQc({
      novelRoot: config.novelRoot,
      n: nextChapter,
      content: combinedQcMarkdown,
    });
    log?.({ event: "result", data: { file: path.basename(qcPath), path: qcPath, pass } });

    const rewriteUserContent = [
      rewritePrompt,
      wrapFile(path.basename(briefPath), briefMarkdown),
      wrapFile(path.basename(chapterPath), currentDraft),
      wrapFile(path.basename(qcPath), combinedQcMarkdown),
      "\n\n=== 草稿长度（去空白字符） ===\n",
      String(currentDraftCharCount),
    ].join("");

    log?.({
      event: "status",
      data: {
        step: "rewrite_after_qc",
        chapter: nextChapter,
        pass,
        totalPasses: qcPasses,
        model: models.write,
      },
    });
    await appendStep({
      runDir: run.dir,
      step: {
        kind: "llm",
        step: "rewrite_after_qc",
        chapter: nextChapter,
        pass,
        totalPasses: qcPasses,
        model: models.write,
        temperature: temps.write,
      },
    });

    const rewriteResult = await openaiChatCompletion({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: models.write,
      messages: [
        { role: "system", content: axis },
        { role: "user", content: rewriteUserContent },
      ],
      temperature: temps.write,
    });
    lastRewriteResult = rewriteResult;

    currentDraft = rewriteResult.text.trim().replace(/\r\n/g, "\n") + "\n";
    currentDraftCharCount = countCharsNoSpace(currentDraft);
    await writeChapter({
      novelRoot: config.novelRoot,
      n: nextChapter,
      content: currentDraft,
    });
    log?.({
      event: "result",
      data: { file: path.basename(chapterPath), path: chapterPath, from: "rewrite_after_qc", pass },
    });
  }

  if (!qcPath) {
    throw new Error("Chapter QC did not run.");
  }

  // const updatePrompt = await loadTaskPrompt({
  //   engineRoot,
  //   relativePath: "tasks/chapter/update_main_files.md",
  // });
  // const continuityPrompt = await loadTaskPrompt({
  //   engineRoot,
  //   relativePath: "tasks/setup/generate_continuity_log.md",
  // });
  // const updateUserContent = [
  //   updatePrompt,
  //   wrapFile("tasks/setup/generate_continuity_log.md", continuityPrompt),
  //   wrapFile(`chapters/chapter_${String(nextChapter).padStart(2, "0")}.md`, chapterDraft),
  //   wrapFile(`chapters/chapter_${String(nextChapter).padStart(2, "0")}_brief.md`, briefMarkdown),
  //   wrapFile("bible.md", coreFiles["bible.md"]),
  //   wrapFile("characters.md", coreFiles["characters.md"]),
  //   wrapFile("outline.md", coreFiles["outline.md"]),
  //   wrapFile("continuity_log.md", coreFiles["continuity_log.md"]),
  // ].join("");

  // log?.({ event: "status", data: { step: "update", chapter: nextChapter, model: models.update } });
  // await appendStep({
  //   runDir: run.dir,
  //   step: { kind: "llm", step: "update", model: models.update, temperature: temps.update },
  // });

  // const updateResult = await openaiChatCompletion({
  //   apiKey: config.openai.apiKey,
  //   baseUrl: config.openai.baseUrl,
  //   model: models.update,
  //   messages: [
  //     { role: "system", content: axis },
  //     { role: "user", content: updateUserContent },
  //   ],
  //   temperature: temps.update,
  // });

  // const updateJson = extractJsonFromMarkedBlock(updateResult.text);
  // if (!updateJson || typeof updateJson !== "object" || typeof updateJson.files !== "object") {
  //   throw new Error("Update step did not return expected JSON.");
  // }

  const mainUpdates: Record<string, unknown> = {};
  // const targetCoreFiles: CoreFileName[] = ["continuity_log.md"];
  // for (const fileName of targetCoreFiles) {
  //   const spec = (updateJson as any).files[fileName];
  //   if (!spec || typeof spec.changed !== "boolean") continue;

  //   if (!spec.changed) {
  //     mainUpdates[fileName] = { changed: false, reason: String(spec.reason || "") };
  //     continue;
  //   }

  //   const content = String(spec.content || "").replace(/\r\n/g, "\n").trim() + "\n";
  //   if (!content.trim()) throw new Error(`Update for ${fileName} is empty.`);

  //   const target =
  //     mainWriteMode === "overwrite"
  //       ? novelPath({ novelRoot: config.novelRoot, relativePath: fileName })
  //       : path.join(run.dir, "draft_main_files", fileName);

  //   if (mainWriteMode === "overwrite") {
  //     await copyIfExists({ from: target, to: path.join(run.dir, "backup", fileName) });
  //   }
  //   await writeUtf8({ filePath: target, content });

  //   mainUpdates[fileName] = { changed: true, reason: String(spec.reason || ""), path: target };
  //   log?.({ event: "result", data: { file: fileName, path: target } });
  // }

  const outputs = {
    chapterNumber: nextChapter,
    chapterBrief: briefPath,
    chapter: chapterPath,
    chapterQc: qcPath,
    qc: { model: models.qc, usage: lastQcResult?.usage, passes: qcPasses },
    rewrite: { model: models.write, usage: lastRewriteResult?.usage, passes: qcPasses },
    summary: null,
    mainUpdates,
  };

  await updateOutputs({ runDir: run.dir, outputs });

  return { runId: run.id, outputs };
}
