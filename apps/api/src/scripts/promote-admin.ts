import { loadEnvFiles } from "../config/load-env.js";
import { createDb } from "../infra/db/client.js";

loadEnvFiles();
import { resolvePlanId } from "../modules/billing/plans.js";
import { UserRepository } from "../modules/users/user.repository.js";

const email = process.argv[2];
const planArg = process.argv.find((a) => a.startsWith("--plan="))?.split("=")[1];

if (!email) {
  console.error("Usage: npm run admin:promote -- <email> [--plan=free|pro|business]");
  process.exit(1);
}

const cfg = process.env.DATABASE_URL;
if (!cfg) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(cfg);
const users = new UserRepository(db);

const existing = await users.findByEmail(email);
if (!existing) {
  console.error(`No user found with email: ${email}`);
  await db.pool.end();
  process.exit(1);
}

const updated = await users.updateAdminFields(existing.id, {
  role: "admin",
  ...(planArg ? { plan: resolvePlanId(planArg) } : {}),
});

await db.pool.end();

if (!updated) {
  console.error("Update failed");
  process.exit(1);
}

console.log(`Promoted ${updated.email} to admin (plan: ${updated.plan}, role: ${updated.role})`);
