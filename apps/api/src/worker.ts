import { loadEnvFiles } from "./config/load-env.js";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadConfig } from "./config/env.js";
import { createDb } from "./infra/db/client.js";
import { createLogger } from "./infra/logger.js";
import { processIngestionJob } from "./modules/ingestion/ingestion.processor.js";

loadEnvFiles();

const cfg = loadConfig();
const db = createDb(cfg.DATABASE_URL);
const logger = createLogger(cfg.LOG_LEVEL, cfg.NODE_ENV !== "production");
logger.info({ aiProvider: cfg.AI_PROVIDER }, "worker_ai_provider");
const connection = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(
  "document-ingestion",
  async (job) => {
    logger.info(
      { jobId: job.id, documentId: job.data.documentId },
      "ingestion_job_start",
    );
    await processIngestionJob(cfg, db, job);
    logger.info({ jobId: job.id }, "ingestion_job_done");
  },
  { connection },
);

worker.on("failed", (job, err) => {
  logger.error(
    {
      err,
      jobId: job?.id,
      documentId: job?.data?.documentId,
    },
    "ingestion_job_failed",
  );
});

const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
for (const sig of signals) {
  process.on(sig, async () => {
    await worker.close();
    connection.disconnect();
    await db.pool.end();
    process.exit(0);
  });
}
