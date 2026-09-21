import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((v) => v === "true");
const positiveNumber = z.coerce.number().positive();
const emptyStringToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CHAIN: z.enum(["bsc-mainnet", "bsc-testnet"]).default("bsc-mainnet"),
  BSC_MAINNET_RPC_URL: z.string().url().default("https://bsc-dataseed1.binance.org"),
  BSC_TESTNET_RPC_URL: z.string().url().default("https://data-seed-prebsc-1-s1.binance.org:8545"),
  READ_ONLY_WALLET_ADDRESS: z.preprocess(emptyStringToUndefined, z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional()),
  PRIVATE_KEY: z.preprocess(emptyStringToUndefined, z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional()),
  MAX_TRADE_USD: positiveNumber.default(25),
  DEFAULT_SLIPPAGE_PERCENT: positiveNumber.default(0.5),
  MAX_SLIPPAGE_PERCENT: positiveNumber.default(1),
  MAX_PRICE_IMPACT_PERCENT: positiveNumber.default(5),
  QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  ENABLE_LIVE_TRADING: booleanString.default("false"),
  PERPS_MODE: z.enum(["paper", "live"]).default("paper"),
  ENABLE_LIVE_PERPS: booleanString.default("false"),
  ALLOW_LIVE_SWITCH: booleanString.default("true"),
  SUPABASE_URL: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
  SUPABASE_ANON_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  SUPABASE_SERVICE_ROLE_KEY: z.preprocess(emptyStringToUndefined, z.string().optional()),
  PERPS_INITIAL_BALANCE_USD: z.string().regex(/^\d+(?:\.\d{1,8})?$/).default("10000"),
  PERPS_MAX_ORDER_USD: z.string().regex(/^\d+(?:\.\d{1,8})?$/).default("1000"),
  PERPS_MAX_LEVERAGE: z.coerce.number().int().min(1).max(125).default(3),
  PERPS_MARK_PROVIDER: z.enum(["binance-usdm", "aster-testnet"]).default("binance-usdm"),
  PERPS_MARK_PRICE_URL: z.string().url().default("https://fapi.binance.com"),
  PERPS_MARK_POLL_MS: z.coerce.number().int().min(1_000).default(3_000),
  PERPS_MARK_STALE_MS: z.coerce.number().int().min(2_000).default(15_000)
}).superRefine((env, context) => {
  const rpc = env.CHAIN === "bsc-mainnet" ? env.BSC_MAINNET_RPC_URL : env.BSC_TESTNET_RPC_URL;
  if (!rpc) context.addIssue({ code: z.ZodIssueCode.custom, path: [env.CHAIN === "bsc-mainnet" ? "BSC_MAINNET_RPC_URL" : "BSC_TESTNET_RPC_URL"], message: "RPC URL is required for the selected chain" });
  if (env.DEFAULT_SLIPPAGE_PERCENT > env.MAX_SLIPPAGE_PERCENT) context.addIssue({ code: z.ZodIssueCode.custom, path: ["DEFAULT_SLIPPAGE_PERCENT"], message: "Default slippage cannot exceed maximum slippage" });
  if ((env.ENABLE_LIVE_TRADING || env.ENABLE_LIVE_PERPS || env.PERPS_MODE === "live") && !env.PRIVATE_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ["PRIVATE_KEY"], message: "A private key is required when live trading is enabled" });
});

export type AppConfig = z.infer<typeof envSchema>;
export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => envSchema.parse(source);
