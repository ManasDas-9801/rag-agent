import type { AppConfig } from "../../config/env.js";
import type { UserRepository } from "../users/user.repository.js";
import { hashPassword, verifyPassword } from "./password.js";
import { hashOpaqueToken, randomRefreshToken } from "./tokens.js";
import type { RefreshTokenRepository } from "./refresh-token.repository.js";

export class AuthService {
  constructor(
    private readonly cfg: AppConfig,
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  private refreshExpiry() {
    const d = new Date();
    d.setDate(d.getDate() + this.cfg.JWT_REFRESH_TTL_DAYS);
    return d;
  }

  async signup(email: string, password: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      const err = new Error("Email already registered");
      (err as NodeJS.ErrnoException).code = "EMAIL_TAKEN";
      throw err;
    }
    const passwordHash = await hashPassword(password, this.cfg.BCRYPT_ROUNDS);
    const user = await this.users.create({ email, passwordHash });
    const refreshPlain = randomRefreshToken();
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: hashOpaqueToken(refreshPlain),
      expiresAt: this.refreshExpiry(),
    });
    return { user, refreshToken: refreshPlain };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) {
      const err = new Error("Invalid credentials");
      (err as NodeJS.ErrnoException).code = "INVALID_CREDENTIALS";
      throw err;
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      const err = new Error("Invalid credentials");
      (err as NodeJS.ErrnoException).code = "INVALID_CREDENTIALS";
      throw err;
    }
    const refreshPlain = randomRefreshToken();
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: hashOpaqueToken(refreshPlain),
      expiresAt: this.refreshExpiry(),
    });
    return { user, refreshToken: refreshPlain };
  }

  async rotateRefreshToken(refreshTokenPlain: string) {
    const record = await this.refreshTokens.findValidByHash(
      hashOpaqueToken(refreshTokenPlain),
    );
    if (!record) {
      const err = new Error("Invalid refresh token");
      (err as NodeJS.ErrnoException).code = "INVALID_REFRESH";
      throw err;
    }
    await this.refreshTokens.revokeById(record.id);
    const user = await this.users.findById(record.userId);
    if (!user) {
      const err = new Error("Invalid refresh token");
      (err as NodeJS.ErrnoException).code = "INVALID_REFRESH";
      throw err;
    }
    const refreshPlain = randomRefreshToken();
    await this.refreshTokens.create({
      userId: user.id,
      tokenHash: hashOpaqueToken(refreshPlain),
      expiresAt: this.refreshExpiry(),
    });
    return { user, refreshToken: refreshPlain };
  }
}
