import fs from "node:fs/promises";
import path from "node:path";

export type AppConfig = {
  host: string;
  port: number;
  novelRoot: string;
  openai: {
    apiKey: string;
    baseUrl: string;
  };
  defaults: {
    models: {
      setup: string;
      summary: string;
      brief: string;
      write: string;
      qc: string;
      update: string;
    };
    temperature: {
      setup: number;
      summary: number;
      brief: number;
      write: number;
      qc: number;
      update: number;
    };
  };
};

type FileConfig = Partial<{
  host: string;
  port: number;
  novelRoot: string;
  openai: { apiKey?: string; baseUrl?: string };
  defaults: {
    models?: Partial<AppConfig["defaults"]["models"]>;
    temperature?: Partial<AppConfig["defaults"]["temperature"]>;
  };
}>;

async function readJsonIfExists(filePath: string): Promise<FileConfig | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as FileConfig;
  } catch (error: any) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return null;
    throw error;
  }
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const num = Number(raw);
  if (Number.isFinite(num)) return num;
  return fallback;
}

export async function loadConfig({ engineRoot }: { engineRoot: string }): Promise<AppConfig> {
  const configPath = path.join(engineRoot, "config.json");
  const fileConfig = (await readJsonIfExists(configPath)) || {};

  const novelRoot = process.env.NOVEL_ROOT || fileConfig.novelRoot || path.resolve(engineRoot, "novel-output");

  return {
    host: process.env.HOST || fileConfig.host || "127.0.0.1",
    port: envNumber("PORT", fileConfig.port || 8787),

    novelRoot,

    openai: {
      apiKey: process.env.OPENAI_API_KEY || fileConfig?.openai?.apiKey || "",
      baseUrl: process.env.OPENAI_BASE_URL || fileConfig?.openai?.baseUrl || "https://api.openai.com/v1",
    },

    defaults: {
      models: {
        setup: fileConfig?.defaults?.models?.setup || "gpt-4o-mini",
        summary: fileConfig?.defaults?.models?.summary || "gpt-4o-mini",
        brief: fileConfig?.defaults?.models?.brief || "gpt-4o-mini",
        write: fileConfig?.defaults?.models?.write || "gpt-4o",
        qc: fileConfig?.defaults?.models?.qc || "gpt-4o-mini",
        update: fileConfig?.defaults?.models?.update || "gpt-4o-mini",
      },
      temperature: {
        setup: fileConfig?.defaults?.temperature?.setup ?? 0.9,
        summary: fileConfig?.defaults?.temperature?.summary ?? 0.2,
        brief: fileConfig?.defaults?.temperature?.brief ?? 0.4,
        write: fileConfig?.defaults?.temperature?.write ?? 0.85,
        qc: fileConfig?.defaults?.temperature?.qc ?? 0.2,
        update: fileConfig?.defaults?.temperature?.update ?? 0.2,
      },
    },
  };
}
