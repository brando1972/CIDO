import type { FastifyInstance } from "fastify";
import { isHash } from "viem";
import type { AppDependencies } from "../app.js";
import { AppError } from "../utils/errors.js";
export function registerTransactionRoutes(app: FastifyInstance, deps: AppDependencies) {
  app.get<{ Params: { hash: string } }>("/transaction/:hash", async (request) => {
    if (!isHash(request.params.hash)) throw new AppError("Invalid transaction hash", "VALIDATION_ERROR", 400);
    const receipt = await deps.blockchain.getPublicClient().getTransactionReceipt({ hash: request.params.hash });
    return { hash: receipt.transactionHash, status: receipt.status === "success" ? "confirmed" : "reverted", blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), explorerUrl: `${getChainConfig(deps.config).explorerUrl}/tx/${receipt.transactionHash}` };
  });
}
import { getChainConfig } from "../config/chains.js";
