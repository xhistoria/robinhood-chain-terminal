# Robinhood Chain Terminal

Standalone Cloudflare-first MVP for a near-real-time, read-only Robinhood Chain terminal.

This repository is independent from Vaultra.

## Product boundary

The first version is a monitoring terminal, not an execution product:

- no wallet connection;
- no private keys;
- no signing;
- no swaps or orders;
- no fabricated data;
- stale/provider-unavailable states are explicit.

## Architecture

```text
Cloudflare Pages/static assets
        ↓
Cloudflare Worker API
        ↓
RPC JSON-RPC polling (Cron + on-demand)
        ↓
D1 chain status, assets, and watchlist
        ↓
SSE-style polling UI with freshness state
```

The MVP intentionally uses polling. It does not claim zero timeout or absolute realtime. A later ingestion worker can add persistent WebSocket subscriptions, durable queues, reorg handling, and backfill.

## Setup

```bash
npm install
npx wrangler d1 create robinhood-chain-terminal
# Put the returned database_id into wrangler.toml
npx wrangler d1 migrations apply robinhood-chain-terminal --local
# For deployed environments, set RPC_URL as a secret:
npx wrangler secret put RPC_URL
npm run dev
```

The RPC URL is never committed. If `RPC_URL` is missing, the API returns an explicit `provider_unavailable` state.

## Validation

```bash
npm test
npm run check
```
## Current capabilities

- Phase 1: bounded ERC-20 `Transfer` event discovery with D1 cursor, deduplication, and backfill window.
- Phase 2: persisted token asset list, transfer activity counts, unique sender counts, and asset detail API.
- Phase 3: market-quality state contract. Price/liquidity remain `Unknown` until an explicitly configured supported market provider returns valid values; transfer activity is never presented as price or liquidity.

## Deploy after code changes

```bash
npx wrangler d1 migrations apply robinhood-chain-terminal --remote
npx wrangler deploy
```

The Cron Trigger runs every minute and processes at most 5 blocks per run. If it falls behind, the UI/API should be extended with a visible backfill lag indicator before increasing the bound.
