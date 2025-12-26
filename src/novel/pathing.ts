import path from "node:path";

export const CORE_FILES = ["bible.md", "characters.md", "outline.md", "continuity_log.md"] as const;
export type CoreFileName = (typeof CORE_FILES)[number];

export function ensureWithinRoot({ root, targetPath }: { root: string; targetPath: string }): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes novelRoot: ${targetPath}`);
  }
  return resolvedTarget;
}

export function novelPath({ novelRoot, relativePath }: { novelRoot: string; relativePath: string }): string {
  const joined = path.join(novelRoot, relativePath);
  return ensureWithinRoot({ root: novelRoot, targetPath: joined });
}

export function chaptersDir(novelRoot: string): string {
  return novelPath({ novelRoot, relativePath: "chapters" });
}

export function runsDir(novelRoot: string): string {
  return novelPath({ novelRoot, relativePath: "runs" });
}

export function draftsDir(novelRoot: string): string {
  return novelPath({ novelRoot, relativePath: "drafts" });
}
