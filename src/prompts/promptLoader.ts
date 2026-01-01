import fs from "node:fs/promises";
import path from "node:path";

async function readText(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw.replace(/\r\n/g, "\n");
}

type AxisKind = "chapter" | "setup";

export async function loadAxisPrompts({
  engineRoot,
  kind = "chapter",
}: {
  engineRoot: string;
  kind?: AxisKind;
}): Promise<string> {
  const axisRoot = path.join(engineRoot, "prompts", "axis");
  const singleFile = path.join(axisRoot, `${kind}.md`);
  return readText(singleFile);
}

export async function loadTaskPrompt({
  engineRoot,
  relativePath,
}: {
  engineRoot: string;
  relativePath: string;
}): Promise<string> {
  return readText(path.join(engineRoot, "prompts", relativePath));
}

export async function loadTemplate({
  engineRoot,
  name,
}: {
  engineRoot: string;
  name: string;
}): Promise<string> {
  return readText(path.join(engineRoot, "templates", name));
}
