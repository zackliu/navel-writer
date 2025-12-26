import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./src/config.js";
import { createRouter } from "./src/server/router.js";

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const engineRoot = path.resolve(__dirname, "..");

  const config = await loadConfig({ engineRoot });
  const router = createRouter({ config, engineRoot });

  const server = http.createServer((req, res) => {
    router(req, res).catch((error: unknown) => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: false,
          error: "Unhandled server error",
          details: String((error as any)?.stack || error),
        })
      );
    });
  });

  server.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `novel-engine listening on http://${config.host}:${config.port} (novelRoot=${config.novelRoot})`
    );
  });
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
