import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";

export const authJwtPlugin = fp(
  async (app, opts: { secret: string; expiresIn: string }) => {
    await app.register(jwt, {
      secret: opts.secret,
      sign: { expiresIn: opts.expiresIn },
    });

    app.decorate(
      "authenticate",
      async function authenticate(request: FastifyRequest, reply: FastifyReply) {
        try {
          await request.jwtVerify();
        } catch {
          reply.unauthorized("Unauthorized");
        }
      },
    );
  },
  { name: "auth-jwt" },
);
