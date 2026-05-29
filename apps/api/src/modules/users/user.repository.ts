import { desc, eq } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import { users, type User } from "../../infra/db/schema.js";
import { resolvePlanId } from "../billing/plans.js";

export class UserRepository {
  constructor(private readonly db: Db) {}

  async findByEmail(email: string) {
    return this.db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });
  }

  async findById(id: string) {
    return this.db.query.users.findFirst({
      where: eq(users.id, id),
    });
  }

  async listAll() {
    return this.db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateAdminFields(
    userId: string,
    patch: { role?: User["role"]; plan?: string },
  ) {
    const plan =
      patch.plan !== undefined ? resolvePlanId(patch.plan) : undefined;
    const [row] = await this.db
      .update(users)
      .set({
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(plan !== undefined ? { plan } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return row ?? null;
  }

  async promoteByEmail(email: string, role: User["role"] = "admin") {
    const [row] = await this.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.email, email.toLowerCase()))
      .returning();
    return row ?? null;
  }

  async create(input: { email: string; passwordHash: string }) {
    const [row] = await this.db
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
      })
      .returning();
    return row;
  }

  toPublic(user: User) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
      createdAt: user.createdAt,
    };
  }
}
