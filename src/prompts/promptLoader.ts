import fs from "node:fs/promises";
import path from "node:path";

async function readText(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath, "utf8");
  return raw.replace(/\r\n/g, "\n");
}

export async function loadAxisPrompts({ engineRoot }: { engineRoot: string }): Promise<string> {
  const axisDir = path.join(engineRoot, "prompts", "axis");
  const names = [
    "01_mission.md",
    "02_project_truth.md",
    "03_story_kernel.md",
    "04_character_kernel.md",
    "05_motifs.md",
    "06_irreversible_consequence.md",
    "07_scene_rules.md",
    "08_artifacts_workflow.md",
    "09_anti_model_taste.md",
    "10_output_protocol.md",
  ];
  const parts: string[] = [];
  for (const name of names) {
    parts.push(await readText(path.join(axisDir, name)));
  }
  return parts.join("\n\n");
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
