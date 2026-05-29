import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 20 });
  const db = drizzle(pool, { schema, logger: false });
  return Object.assign(db, { pool });
}

export { schema };
