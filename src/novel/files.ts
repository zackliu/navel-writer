import fs from "node:fs/promises";
import path from "node:path";
import { ensureWithinRoot } from "./pathing.js";

export async function readUtf8IfExists(filePath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw.replace(/\r\n/g, "\n");
  } catch (error: any) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeUtf8({ filePath, content }: { filePath: string; content: string }): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content.replace(/\r\n/g, "\n"), "utf8");
}

export async function copyIfExists({ from, to }: { from: string; to: string }): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    return true;
  } catch (error: any) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function listFilesRecursive({ root, maxDepth = 3 }: { root: string; maxDepth?: number }): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  await walk(root, 0);
  return results.sort();
}

export function safeUserPath({ novelRoot, userPath }: { novelRoot: string; userPath: string }): { normalized: string; abs: string } {
  const normalized = String(userPath || "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0")) throw new Error("Invalid path");
  const abs = ensureWithinRoot({ root: novelRoot, targetPath: path.join(novelRoot, normalized) });
  return { normalized, abs };
}
