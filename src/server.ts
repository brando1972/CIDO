import { createApp } from "./create-app.js";

const { app, config } = await createApp();
await app.listen({ host: "0.0.0.0", port: config.PORT });
