import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../../../modules/auth/auth.service.js";
import type { UserRepository } from "../../../modules/users/user.repository.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = signupSchema;

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: { authService: AuthService; users: UserRepository },
) {
  app.post(
    "/v1/auth/signup",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8, maxLength: 128 },
          },
        },
      },
    },
    async (req, reply) => {
      const body = signupSchema.parse(req.body);
      try {
        const { user, refreshToken } = await deps.authService.signup(
          body.email,
          body.password,
        );
        const accessToken = await reply.jwtSign({
          sub: user.id,
          role: user.role,
        });
        return {
          accessToken,
          refreshToken,
          user: deps.users.toPublic(user),
        };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EMAIL_TAKEN") {
          return reply.conflict("Email already registered");
        }
        throw e;
      }
    },
  );

  app.post(
    "/v1/auth/login",
    {
      config: { rateLimit: { max: 40, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      try {
        const { user, refreshToken } = await deps.authService.login(
          body.email,
          body.password,
        );
        const accessToken = await reply.jwtSign({
          sub: user.id,
          role: user.role,
        });
        return {
          accessToken,
          refreshToken,
          user: deps.users.toPublic(user),
        };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "INVALID_CREDENTIALS") {
          return reply.unauthorized("Invalid credentials");
        }
        throw e;
      }
    },
  );

  app.post(
    "/v1/auth/refresh",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: { refreshToken: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const body = refreshSchema.parse(req.body);
      try {
        const { user, refreshToken } = await deps.authService.rotateRefreshToken(
          body.refreshToken,
        );
        const accessToken = await reply.jwtSign({
          sub: user.id,
          role: user.role,
        });
        return { accessToken, refreshToken, user: deps.users.toPublic(user) };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "INVALID_REFRESH") {
          return reply.unauthorized("Invalid refresh token");
        }
        throw e;
      }
    },
  );
}
