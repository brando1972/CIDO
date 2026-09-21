import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../app.js";
import { quoteSchema } from "../trading/schemas.js";
export function registerQuoteRoutes(app: FastifyInstance, deps: AppDependencies) { app.post("/quote", async (request) => deps.trades.quote(quoteSchema.parse(request.body))); }
