import { Queue } from "bullmq";
import { Redis } from "ioredis";

export function createIngestionQueue(redisUrl: string) {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<{ documentId: string }>("document-ingestion", {
    connection,
  });
  return { queue, connection };
}
