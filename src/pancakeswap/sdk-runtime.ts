import { createRequire } from "node:module";

// PancakeSwap's pinned 7.7.0 ESM graph imports Scaled UI symbols absent from its
// pinned swap-sdk-core 1.6.0. The equivalent official CJS bundle loads correctly.
const require = createRequire(import.meta.url);
export const pancakeSdk = require("@pancakeswap/sdk") as typeof import("@pancakeswap/sdk");
export const smartRouterSdk = require("@pancakeswap/smart-router") as typeof import("@pancakeswap/smart-router");
