import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/create-app.js";

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = (async () => {
      const { app } = await createApp({ isServerless: true });
      await app.ready();
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
