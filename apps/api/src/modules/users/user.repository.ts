import { eq } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import { users, type User } from "../../infra/db/schema.js";

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
      createdAt: user.createdAt,
    };
  }
}
