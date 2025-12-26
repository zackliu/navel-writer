import fs from "node:fs/promises";
import path from "node:path";
import type http from "node:http";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export async function tryServeStatic({
  publicRoot,
  urlPathname,
  res,
}: {
  publicRoot: string;
  urlPathname: string;
  res: http.ServerResponse;
}): Promise<boolean> {
  const safePath = urlPathname.replace(/\\/g, "/");
  const rel = safePath.startsWith("/") ? safePath.slice(1) : safePath;
  const abs = path.join(publicRoot, rel || "index.html");
  const resolvedPublic = path.resolve(publicRoot);
  const resolvedAbs = path.resolve(abs);
  if (!resolvedAbs.startsWith(resolvedPublic)) return false;

  try {
    const data = await fs.readFile(resolvedAbs);
    const ext = path.extname(resolvedAbs).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", CONTENT_TYPES[ext] || "application/octet-stream");
    res.end(data);
    return true;
  } catch (error: any) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}
