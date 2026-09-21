import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppDependencies } from "../app.js";
import { getSupabaseClient } from "../db/supabase.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string | undefined;
    } | null | undefined;
  }
}

export function registerAuthRoutes(app: FastifyInstance, deps: AppDependencies) {
  const supabase = getSupabaseClient(deps.config);

  // Return public client configuration so frontend can authenticate
  app.get("/api/auth/config", async () => {
    return {
      enabled: Boolean(deps.config.SUPABASE_URL && deps.config.SUPABASE_ANON_KEY),
      supabaseUrl: deps.config.SUPABASE_URL || null,
      supabaseAnonKey: deps.config.SUPABASE_ANON_KEY || null,
    };
  });

  // Authentication hook
  app.addHook("preHandler", async (request: FastifyRequest) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ") || !supabase) {
      request.user = null;
      return;
    }

    const token = authHeader.slice(7).trim();
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        request.user = null;
        return;
      }
      request.user = {
        id: data.user.id,
        email: data.user.email,
      };
    } catch {
      request.user = null;
    }
  });

  // User session info
  app.get("/api/auth/me", async (request) => {
    return {
      authenticated: Boolean(request.user),
      user: request.user ?? null,
    };
  });
}
