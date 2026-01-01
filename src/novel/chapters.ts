import fs from "node:fs/promises";
import path from "node:path";
import { chaptersDir, ensureWithinRoot } from "./pathing.js";
import { readUtf8IfExists, writeUtf8 } from "./files.js";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function chapterBasename(n: number): string {
  return `chapter_${pad2(n)}`;
}

export function chapterFileName(n: number): string {
  return `${chapterBasename(n)}.md`;
}

export function chapterBriefFileName(n: number): string {
  return `${chapterBasename(n)}_brief.md`;
}

export function chapterBriefQcFileName(n: number): string {
  return `${chapterBasename(n)}_brief_qc.md`;
}

export function chapterQcFileName(n: number): string {
  return `${chapterBasename(n)}_qc.md`;
}

function parseChapterNumber(fileName: string): number | null {
  const m = /^chapter_(\d{2})\.md$/i.exec(fileName);
  if (!m) return null;
  return Number(m[1]);
}

export async function listChapterNumbers({ novelRoot }: { novelRoot: string }): Promise<number[]> {
  const dir = chaptersDir(novelRoot);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nums = entries
      .filter((e) => e.isFile())
      .map((e) => parseChapterNumber(e.name))
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      .sort((a, b) => a - b);
    return nums;
  } catch (error: any) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

export async function readChapter({ novelRoot, n }: { novelRoot: string; n: number }): Promise<string | null> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, chapterFileName(n)) });
  return readUtf8IfExists(abs);
}

export async function readChapterBrief({
  novelRoot,
  n,
}: {
  novelRoot: string;
  n: number;
}): Promise<string | null> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, chapterBriefFileName(n)) });
  return readUtf8IfExists(abs);
}

export async function writeChapter({
  novelRoot,
  n,
  content,
}: {
  novelRoot: string;
  n: number;
  content: string;
}): Promise<string> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, chapterFileName(n)) });
  await writeUtf8({ filePath: abs, content });
  return abs;
}

export async function writeChapterBrief({
  novelRoot,
  n,
  content,
}: {
  novelRoot: string;
  n: number;
  content: string;
}): Promise<string> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, chapterBriefFileName(n)) });
  await writeUtf8({ filePath: abs, content });
  return abs;
}

export async function writeChapterBriefQc({
  novelRoot,
  n,
  content,
}: {
  novelRoot: string;
  n: number;
  content: string;
}): Promise<string> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, chapterBriefQcFileName(n)) });
  await writeUtf8({ filePath: abs, content });
  return abs;
}

export async function writeChapterQc({
  novelRoot,
  n,
  content,
}: {
  novelRoot: string;
  n: number;
  content: string;
}): Promise<string> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, chapterQcFileName(n)) });
  await writeUtf8({ filePath: abs, content });
  return abs;
}

export async function readSummary({ novelRoot }: { novelRoot: string }): Promise<string | null> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, "_summary.md") });
  return readUtf8IfExists(abs);
}

export async function writeSummary({ novelRoot, content }: { novelRoot: string; content: string }): Promise<string> {
  const dir = chaptersDir(novelRoot);
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(dir, "_summary.md") });
  await writeUtf8({ filePath: abs, content });
  return abs;
}

export function parseSummaryUpTo(summaryMarkdown: string | null): number | null {
  if (!summaryMarkdown) return null;
  const m = /^<!--\s*summary_up_to:\s*(\d+)\s*-->$/m.exec(summaryMarkdown);
  if (!m) return null;
  return Number(m[1]);
}
