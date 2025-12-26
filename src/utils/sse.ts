import type http from "node:http";

export function isSseRequest(req: http.IncomingMessage, urlObj: URL): boolean {
  const accept = String(req.headers.accept || "");
  if (accept.includes("text/event-stream")) return true;
  return urlObj.searchParams.get("stream") === "1";
}

export function startSse(res: http.ServerResponse): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write("\n");
}

export function sseSend(
  res: http.ServerResponse,
  { event, data }: { event?: string; data: unknown }
): void {
  if (event) res.write(`event: ${event}\n`);
  const payload = typeof data === "string" ? data : JSON.stringify(data, null, 0);
  for (const line of payload.split("\n")) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}
