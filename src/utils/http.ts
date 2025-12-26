import type http from "node:http";

export function readRequestBody(
  req: http.IncomingMessage,
  { limitBytes = 2_000_000 }: { limitBytes?: number } = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error(`Request body too large (>${limitBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJson<T = any>(
  req: http.IncomingMessage,
  opts?: { limitBytes?: number }
): Promise<T | null> {
  const buf = await readRequestBody(req, opts);
  if (!buf.length) return null;
  const raw = buf.toString("utf8");
  return JSON.parse(raw) as T;
}

export function sendJson(res: http.ServerResponse, statusCode: number, obj: any): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export function sendText(
  res: http.ServerResponse,
  statusCode: number,
  text: string,
  contentType = "text/plain; charset=utf-8"
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.end(text);
}
