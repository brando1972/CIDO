import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppDependencies } from "../app.js";
import { AuthService, type SessionUser } from "../auth/auth.service.js";
import { CidoDatabaseRepository, getPostgresPool } from "../db/db.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser | null | undefined;
  }
}

let sharedAuthService: AuthService | null = null;

export function getAuthService(deps?: AppDependencies): AuthService {
  if (sharedAuthService) return sharedAuthService;

  const pool = getPostgresPool();
  const cidoDb = new CidoDatabaseRepository(pool);
  sharedAuthService = new AuthService(cidoDb);
  return sharedAuthService;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AppDependencies) {
  const authService = deps.authService || getAuthService(deps);

  // Authentication configuration status
  app.get("/api/auth/config", async () => {
    return {
      enabled: true,
      authType: "cido_db_2fa",
      requires2fa: true,
    };
  });

  // Pre-handler hook to authenticate requests bearing Bearer tokens
  app.addHook("preHandler", async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      request.user = null;
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      request.user = null;
      return;
    }

    const sessionUser = authService.verifySession(token);
    request.user = sessionUser;
  });

  // User session info
  app.get("/api/auth/me", async (request) => {
    return {
      authenticated: Boolean(request.user),
      user: request.user ?? null,
    };
  });

  // Step 1: Login with username & password
  app.post("/api/auth/login", async (request, reply) => {
    const body = (request.body || {}) as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Username and password are required" },
      });
    }

    const result = await authService.login(username, password);
    if (!result.success) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: result.error || "Invalid username or password" },
      });
    }

    if (result.require2fa) {
      return reply.send({
        status: "2fa_required",
        challengeToken: result.challengeToken,
      });
    }

    return reply.send({
      status: "authenticated",
      token: result.token,
      user: result.user,
    });
  });

  // Step 2: Verify 2FA TOTP code
  app.post("/api/auth/2fa/verify", async (request, reply) => {
    const body = (request.body || {}) as { challengeToken?: string; code?: string };
    const { challengeToken, code } = body;

    if (!challengeToken || !code) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Challenge token and 6-digit code are required" },
      });
    }

    const result = await authService.verify2fa(challengeToken, code);
    if (!result.success) {
      return reply.status(401).send({
        error: { code: "INVALID_2FA", message: result.error || "Invalid 2FA code" },
      });
    }

    return reply.send({
      status: "authenticated",
      token: result.token,
      user: result.user,
    });
  });

  // 2FA Setup helper (for enrolled users)
  app.get("/api/auth/setup-info", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Authentication required" },
      });
    }

    const setup = await authService.get2faSetup(request.user.id);
    if (!setup) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "User setup information not found" },
      });
    }

    return reply.send({
      username: request.user.username,
      secret: setup.secret,
      uri: setup.uri,
    });
  });

  // Logout
  app.post("/api/auth/logout", async (_request, reply) => {
    return reply.send({ status: "logged_out" });
  });
}
