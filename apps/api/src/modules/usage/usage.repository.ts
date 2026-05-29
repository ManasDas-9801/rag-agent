import type { Db } from "../../infra/db/client.js";
import { usageEvents } from "../../infra/db/schema.js";

export class UsageRepository {
  constructor(private readonly db: Db) {}

  async log(input: typeof usageEvents.$inferInsert) {
    await this.db.insert(usageEvents).values(input);
  }
}
