import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/env.js";
import { BlockchainClient } from "../../src/blockchain/client.js";
const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
describe.skipIf(!enabled)("BSC RPC", () => { it("connects to the configured chain", async () => { const client = new BlockchainClient(loadConfig()); expect(await client.checkChain()).toBeGreaterThan(0); }); });
