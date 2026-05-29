import fs from "node:fs/promises";
import { loadEnvFiles } from "./config/load-env.js";
import { loadConfig } from "./config/env.js";
import { buildApp } from "./http/app.js";

loadEnvFiles();

const cfg = loadConfig();
await fs.mkdir(cfg.UPLOAD_DIR, { recursive: true });

const { app, ctx } = await buildApp(cfg);
app.log.info({ aiProvider: cfg.AI_PROVIDER }, "ai_provider");

const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const sig of signals) {
  process.on(sig, async () => {
    await ctx.close();
    process.exit(0);
  });
}

await app.listen({ port: cfg.API_PORT, host: cfg.API_HOST });
