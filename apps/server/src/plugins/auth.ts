import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

const unauthorizedBody = {
  error: {
    code: "UNAUTHORIZED",
    message: "Missing or invalid bearer token"
  }
};

export async function registerAuthPlugin(app: FastifyInstance, config: AppConfig) {
  app.addHook("onRequest", async (request, reply) => {
    if (!config.adminToken) {
      return;
    }

    if (!hasValidBearerToken(request, config.adminToken)) {
      sendUnauthorized(reply);
    }
  });
}

function hasValidBearerToken(request: FastifyRequest, token: string) {
  return request.headers.authorization === `Bearer ${token}`;
}

function sendUnauthorized(reply: FastifyReply) {
  reply.code(401).send(unauthorizedBody);
}
