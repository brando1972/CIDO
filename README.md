# CIDO PancakeSwap Trading Lab

Safety-first Node.js/TypeScript service for PancakeSwap V2/V3 spot trading on BNB Chain. It exposes validated API contracts, centralized chain/token configuration, RPC and wallet abstractions, risk checks, typed errors, a current Smart Router integration, mandatory simulation, and guarded transaction execution.

The service now also includes a separate perpetuals paper-trading laboratory for **PancakeSwap Perps V2, powered by Aster infrastructure**. It models BTCUSD, ETHUSD, and BNBUSD long/short market and limit orders, isolated margin, a hard 3× leverage cap, fees, liquidation estimates, mandatory fixed stop-losses, optional take-profit/trailing stops, reduce-only closes, an emergency close-all operation, and a global kill switch. Public Aster Futures Testnet mark prices and funding rates continuously revalue the simulation. This is a testnet-data-backed paper adapter: it does not claim to be an official PancakeSwap paper venue and cannot submit venue orders yet.

> **Current milestone:** real BSC testnet RPC and USDT→CAKE quotes are verified. Live trading remains disabled and no funded wallet has been installed. BSC testnet liquidity is sparse, so larger quotes can correctly fail the configured price-impact limit.

The integration pins `@pancakeswap/smart-router@7.7.0`, `@pancakeswap/swap-sdk-core@1.6.0`, `@pancakeswap/chains@0.9.0`, `@pancakeswap/tokens@0.9.0`, and `viem@2.37.13`. It uses the official Smart Router addresses, V2/V3 candidate pools, exact-input routing, exact approvals, and raw-call simulation.

## Safety state

- `ENABLE_LIVE_TRADING` defaults to `false`.
- There is no generic signing endpoint.
- Secrets are redacted from structured logs.
- The image does not contain `.env`.
- The DEX adapter cannot approve or broadcast unless the live flag is explicitly enabled and a wallet is configured.
- `PERPS_MODE` is restricted to `paper`, and `ENABLE_LIVE_PERPS` is restricted to `false`; unsupported live-perps configuration fails at startup.
- Paper orders require a matching, single-use, 30-second confirmation token from the preview endpoint.
- A private key is optional for health/RPC and will eventually be replaced by Vault/KMS.

## Architecture

`Fastify routes → Zod validation → TradeService/risk policy → DexAdapter → viem clients → BNB Chain`

PancakeSwap-specific functionality is isolated behind `DexAdapter`; request metadata is retained only as untrusted context and is never used to bypass policy.

## Prerequisites and installation

- Node.js 22+
- Docker with Compose
- A BSC RPC endpoint

```bash
cp .env.example .env
npm install
npm run typecheck
npm test
npm run build
```

Set the RPC for the selected chain. Leave `PRIVATE_KEY` empty for RPC/quote-only work. Never commit `.env` or use a wallet holding material funds.

Set `READ_ONLY_WALLET_ADDRESS` to a public `0x...` address to display balances without installing signing credentials. If a private key is later configured, its derived signer address takes precedence.

## Environment

| Variable | Purpose |
|---|---|
| `CHAIN` | `bsc-testnet` or `bsc-mainnet` |
| `BSC_*_RPC_URL` | RPC URL for the selected chain |
| `PRIVATE_KEY` | POC signer; required only when live trading is enabled |
| `READ_ONLY_WALLET_ADDRESS` | Optional public address for balance display and simulation without signing |
| `MAX_TRADE_USD` | Server-side USD quote-token cap |
| `DEFAULT_SLIPPAGE_PERCENT` | Default request slippage |
| `MAX_SLIPPAGE_PERCENT` | Hard slippage ceiling |
| `MAX_PRICE_IMPACT_PERCENT` | Hard quote impact ceiling |
| `QUOTE_TTL_SECONDS` | Quote freshness window |
| `ENABLE_LIVE_TRADING` | Must remain `false` until controlled test stages |
| `PERPS_MODE` | Must be `paper` in this build |
| `ENABLE_LIVE_PERPS` | Must be `false`; live perps execution is not implemented |
| `PERPS_INITIAL_BALANCE_USD` | Starting balance for the in-memory paper ledger |
| `PERPS_MAX_ORDER_USD` | Server-side cap for each paper order; defaults to $1,000 |
| `PERPS_MAX_LEVERAGE` | Paper-only leverage ceiling; defaults to 3× and is configurable up to 125× for explicit test scenarios |
| `PERPS_MARK_PRICE_URL` | Public Aster Futures Testnet market-data source; no API key is used |
| `PERPS_MARK_POLL_MS` | Server-side reference-price polling interval |
| `PERPS_MARK_STALE_MS` | Age after which the reference feed is reported stale |

## Run

```bash
npm run dev
# or, with a host-owned secrets file
TRADER_ENV_FILE=/etc/pancakeswap-trader-poc/trader.env docker compose up -d
curl http://localhost:3001/health
```

The Docker health check uses `GET /health`. It will report RPC/chain problems rather than returning a false healthy state.

## API examples

```bash
curl http://localhost:3001/health
curl http://localhost:3001/balance
curl http://localhost:3001/balance/CAKE

curl -X POST http://localhost:3001/quote -H 'content-type: application/json' \
  -d '{"tokenIn":"USDT","tokenOut":"CAKE","amountIn":"10","slippagePercent":0.5}'

curl -X POST http://localhost:3001/trade -H 'content-type: application/json' \
  -d '{"requestId":"external-1","tokenIn":"USDT","tokenOut":"CAKE","amountIn":"10","maxSlippagePercent":0.5,"metadata":{"source":"signal-engine"}}'

curl -X POST http://localhost:3001/trade/buy -H 'content-type: application/json' \
  -d '{"token":"CAKE","quoteToken":"USDT","amount":"10","maxSlippagePercent":0.5}'

curl -X POST http://localhost:3001/trade/sell -H 'content-type: application/json' \
  -d '{"token":"CAKE","quoteToken":"USDT","amount":"1.5","maxSlippagePercent":0.5}'

curl http://localhost:3001/transaction/0xTRANSACTION_HASH
```

### Perpetuals paper API

```bash
curl http://localhost:3001/api/perps/markets
curl http://localhost:3001/api/perps/account
curl http://localhost:3001/api/perps/positions
curl http://localhost:3001/api/perps/orders
curl http://localhost:3001/api/perps/ticker
curl http://localhost:3001/api/perps/safety

curl -X POST http://localhost:3001/api/perps/orders/preview \
  -H 'content-type: application/json' \
  -d '{"market":"BTCUSD","side":"long","sizeUsd":"100","leverage":"3","orderType":"market","stopLossPrice":"70000","reduceOnly":false}'
```

Use the returned `confirmationToken` with the exact same order fields in `POST /api/perps/orders`. A changed or expired preview is rejected. Every opening order requires `stopLossPrice`. `trailingStopPercent` is optional, must be greater than zero and no more than 50, and ratchets from the most favorable live mark after fill. Open positions are marked continuously, while crossed limit orders and configured TP/SL/trailing levels are evaluated after each accepted price update. Provider errors and stale data are surfaced through `/api/perps/ticker`; they never enable live execution. `POST /api/perps/emergency-close` closes every position, cancels open orders, and enables the kill switch. Paper state is intentionally in memory and resets when the service restarts.

## Testnet, mainnet, and round trip

1. Start with BSC Testnet RPC connectivity and a dedicated wallet holding only faucet funds.
2. Run `npm run quote:test` against the simulation-only API.
3. Verify balances, allowance requirements, calldata, and failed-simulation lockout.
4. Test exact approval and a tiny swap on testnet where liquidity supports it.
5. Run `ENABLE_LIVE_TRADING=true npm run round-trip` only during an explicitly authorized funded test window.
6. Return the service and shell environment to `ENABLE_LIVE_TRADING=false` immediately afterward.
7. Only then consider a tiny capped mainnet test.

The round-trip script requires `ENABLE_LIVE_TRADING=true` in its own shell in addition to the server-side gate. It buys CAKE, verifies the acquired balance, sells only that acquired amount, and prints the before/after result.

## Security warnings

Do not expose port 3001 publicly. Place authentication, TLS, an IP allowlist, request replay protection, and rate limiting in front of it before connecting an external signal service. A production deployment should use Vault/KMS or a hardware-backed signer, immutable images, restricted egress, monitoring, and a separately funded low-value wallet.

## Troubleshooting

- Startup configuration error: set the RPC URL matching `CHAIN`.
- `WALLET_NOT_CONFIGURED`: add a dedicated POC wallet key only for balance/signing stages.
- `UNSUPPORTED_TOKEN`: only WBNB, USDT, USDC, and CAKE are accepted.
- `PRICE_IMPACT_EXCEEDED`: reduce the amount or use a better-liquidity network; never loosen the cap merely to force a testnet quote.
- `WRONG_CHAIN`: the configured RPC is serving a different chain ID.
