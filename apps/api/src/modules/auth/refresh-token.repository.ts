import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../../infra/db/client.js";
import { refreshTokens } from "../../infra/db/schema.js";

export class RefreshTokenRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const [row] = await this.db
      .insert(refreshTokens)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning({ id: refreshTokens.id });
    return row;
  }

  async findValidByHash(tokenHash: string) {
    return this.db.query.refreshTokens.findFirst({
      where: and(
        eq(refreshTokens.tokenHash, tokenHash),
        gt(refreshTokens.expiresAt, new Date()),
        isNull(refreshTokens.revokedAt),
      ),
    });
  }

  async revokeById(id: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, id));
  }

  async revokeAllForUser(userId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
      );
  }
}
