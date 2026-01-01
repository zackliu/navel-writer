import path from "node:path";
import type http from "node:http";

import type { AppConfig } from "../config.js";
import { CORE_FILES } from "../novel/pathing.js";
import { listFilesRecursive, readUtf8IfExists, safeUserPath, writeUtf8 } from "../novel/files.js";
import { listChapterNumbers } from "../novel/chapters.js";
import { readJson, sendJson } from "../utils/http.js";
import { isSseRequest, sseSend, startSse } from "../utils/sse.js";
import { tryServeStatic } from "./static.js";
import { generateSetup } from "../workflows/generateSetup.js";
import { developChapter } from "../workflows/developChapter.js";

export function createRouter({ config, engineRoot }: { config: AppConfig; engineRoot: string }) {
  const publicRoot = path.join(engineRoot, "public");

  return async function router(req: http.IncomingMessage, res: http.ServerResponse) {
    const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (urlObj.pathname.startsWith("/api/")) {
      if (req.method === "GET" && urlObj.pathname === "/api/health") {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === "GET" && urlObj.pathname === "/api/state") {
        const core: Record<
          (typeof CORE_FILES)[number],
          { exists: boolean; bytes: number }
        > = {} as any;
        for (const f of CORE_FILES) {
          const content = await readUtf8IfExists(path.join(config.novelRoot, f));
          core[f] = { exists: Boolean(content), bytes: content ? Buffer.byteLength(content, "utf8") : 0 };
        }
        const chapters = await listChapterNumbers({ novelRoot: config.novelRoot });
        return sendJson(res, 200, {
          ok: true,
          novelRoot: config.novelRoot,
          core,
          chapters,
        });
      }

      if (req.method === "GET" && urlObj.pathname === "/api/files") {
        const files = await listFilesRecursive({ root: config.novelRoot, maxDepth: 4 });
        const rel = files.map((p) => path.relative(config.novelRoot, p).replace(/\\/g, "/"));
        const filtered = rel
          .filter((p) => p.endsWith(".md") || p.endsWith(".json"))
          .filter((p) => !p.startsWith("novel-engine/"));
        return sendJson(res, 200, { ok: true, files: filtered });
      }

      if (req.method === "GET" && urlObj.pathname === "/api/file") {
        const userPath = urlObj.searchParams.get("path");
        if (!userPath) return sendJson(res, 400, { ok: false, error: "Missing path" });
        const { normalized, abs } = safeUserPath({ novelRoot: config.novelRoot, userPath });
        if (!normalized.endsWith(".md") && !normalized.endsWith(".json")) {
          return sendJson(res, 400, { ok: false, error: "Only .md/.json supported" });
        }
        const content = await readUtf8IfExists(abs);
        if (content == null) return sendJson(res, 404, { ok: false, error: "Not found" });
        return sendJson(res, 200, { ok: true, path: normalized, content });
      }

      if (req.method === "POST" && urlObj.pathname === "/api/file") {
        const body = await readJson(req);
        if (!body || typeof body !== "object") return sendJson(res, 400, { ok: false, error: "Invalid body" });
        const { normalized, abs } = safeUserPath({ novelRoot: config.novelRoot, userPath: body?.path });
        if (!normalized.endsWith(".md") && !normalized.endsWith(".json")) {
          return sendJson(res, 400, { ok: false, error: "Only .md/.json supported" });
        }
        await writeUtf8({ filePath: abs, content: String(body?.content || "") });
        return sendJson(res, 200, { ok: true, path: normalized });
      }

      if (req.method === "POST" && urlObj.pathname === "/api/generate-setup") {
        const body = await readJson(req);
        const stream = isSseRequest(req, urlObj);
        if (stream) startSse(res);

        const requestedMode = body?.mode === "incremental" ? "incremental" : "full";
        const writeMode = body?.writeMode || (requestedMode === "incremental" ? "draft" : "draft");

        const log = stream
          ? (evt: { event?: string; data: unknown }) => sseSend(res, evt)
          : null;

        try {
          const result = await generateSetup({
            config,
            engineRoot,
            requirements: body?.requirements || "",
            files: body?.files,
            modelsByFile: body?.models,
            writeMode,
            mode: requestedMode,
            targetFile: body?.targetFile,
            contextFiles: body?.contextFiles,
            temperature: typeof body?.temperature === "number" ? body.temperature : undefined,
            log,
          });

          if (stream) {
            sseSend(res, { event: "done", data: { ok: true, ...result } });
            res.end();
            return;
          }

          return sendJson(res, 200, { ok: true, ...result });
        } catch (error: any) {
          if (stream) {
            sseSend(res, { event: "error", data: { ok: false, error: String(error?.message || error) } });
            res.end();
            return;
          }
          return sendJson(res, 500, { ok: false, error: String(error?.message || error) });
        }
      }

      if (req.method === "POST" && urlObj.pathname === "/api/develop-chapter") {
        const body = await readJson(req);
        const stream = isSseRequest(req, urlObj);
        if (stream) startSse(res);

        const log = stream
          ? (evt: { event?: string; data: unknown }) => sseSend(res, evt)
          : null;

        try {
          const chapterNumber =
            body?.chapterNumber == null ? undefined : Number(body.chapterNumber);
          const qcPasses = body?.qcPasses == null ? undefined : Number(body.qcPasses);
          const useExistingBrief = body?.useExistingBrief === true;
          const result = await developChapter({
            config,
            engineRoot,
            userGuidance: body?.userGuidance || "",
            chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : undefined,
            qcPasses: Number.isFinite(qcPasses) ? qcPasses : undefined,
            models: body?.models,
            temperatures: body?.temperatures,
            mainWriteMode: body?.mainWriteMode || "overwrite",
            useExistingBrief,
            log,
          });

          if (stream) {
            sseSend(res, { event: "done", data: { ok: true, ...result } });
            res.end();
            return;
          }

          return sendJson(res, 200, { ok: true, ...result });
        } catch (error: any) {
          if (stream) {
            sseSend(res, { event: "error", data: { ok: false, error: String(error?.message || error) } });
            res.end();
            return;
          }
          return sendJson(res, 500, { ok: false, error: String(error?.message || error) });
        }
      }

      return sendJson(res, 404, { ok: false, error: "Not found" });
    }

    // static
    if (await tryServeStatic({ publicRoot, urlPathname: urlObj.pathname, res })) return;

    // SPA fallback
    if (await tryServeStatic({ publicRoot, urlPathname: "/index.html", res })) return;

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  };
}
