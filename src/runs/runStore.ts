import fs from "node:fs/promises";
import path from "node:path";

import { ensureWithinRoot, runsDir } from "../novel/pathing.js";
import { writeUtf8 } from "../novel/files.js";

type RunType = "setup" | "chapter";

type RunJson = {
  id: string;
  type: RunType;
  createdAt: string;
  input: unknown;
  steps: Array<{ at: string } & Record<string, unknown>>;
  outputs: Record<string, unknown>;
};

function makeRunId({ type }: { type: RunType }): string {
  const d = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}` +
    `${pad2(d.getMonth() + 1)}` +
    `${pad2(d.getDate())}_` +
    `${pad2(d.getHours())}` +
    `${pad2(d.getMinutes())}` +
    `${pad2(d.getSeconds())}`;
  return `${stamp}_${type}`;
}

export async function createRun({
  novelRoot,
  type,
  input,
}: {
  novelRoot: string;
  type: RunType;
  input: unknown;
}): Promise<{ id: string; dir: string; runPath: string; run: RunJson }> {
  const id = makeRunId({ type });
  const dir = ensureWithinRoot({ root: novelRoot, targetPath: path.join(runsDir(novelRoot), id) });
  await fs.mkdir(dir, { recursive: true });

  const run: RunJson = {
    id,
    type,
    createdAt: new Date().toISOString(),
    input,
    steps: [],
    outputs: {},
  };

  const runPath = path.join(dir, "run.json");
  await writeUtf8({ filePath: runPath, content: JSON.stringify(run, null, 2) });
  return { id, dir, runPath, run };
}

export async function appendStep({
  runDir,
  step,
}: {
  runDir: string;
  step: Record<string, unknown>;
}): Promise<void> {
  const runPath = path.join(runDir, "run.json");
  const raw = await fs.readFile(runPath, "utf8");
  const run = JSON.parse(raw) as RunJson;
  run.steps.push({ at: new Date().toISOString(), ...step });
  await writeUtf8({ filePath: runPath, content: JSON.stringify(run, null, 2) });
}

export async function updateOutputs({
  runDir,
  outputs,
}: {
  runDir: string;
  outputs: Record<string, unknown>;
}): Promise<void> {
  const runPath = path.join(runDir, "run.json");
  const raw = await fs.readFile(runPath, "utf8");
  const run = JSON.parse(raw) as RunJson;
  run.outputs = { ...run.outputs, ...outputs };
  await writeUtf8({ filePath: runPath, content: JSON.stringify(run, null, 2) });
}
