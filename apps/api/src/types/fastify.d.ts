import "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: "user" | "admin" };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user: { sub: string; role: "user" | "admin" };
  }

  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }

  interface RouteConfig {
    rateLimit?:
      | boolean
      | {
          max?: number;
          timeWindow?: string | number;
        };
  }
}
