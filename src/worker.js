import { TRANSFER_TOPIC, decodeTransferLog, buildBlockRange, hexBlock, classifyMarketData } from './indexer.js';
import { buildTradeabilityPassport, calculatePaperPnl, normalizeAlert } from './product.js';
import { decodeAbiString, decodeAbiUint, metadataCallData, normalizeMetadata } from './metadata.js';
import { fetchMarketData, marketStatusFromError, summarizeMarketStatuses } from './market.js';

const DEFAULT_CHAIN_ID = '4663';
const DEFAULT_RPC_TIMEOUT_MS = 3000;
const MAX_INDEX_BLOCKS = 5;
const MAX_METADATA_ASSETS = 3;

function freshness(observedAt, now = Date.now()) {
  if (!observedAt) return 'unknown';
  const age = now - Date.parse(observedAt);
  if (!Number.isFinite(age) || age < 0) return 'unknown';
  return age <= 30_000 ? 'live' : age <= 120_000 ? 'delayed' : 'stale';
}

async function rpcCall({ env = {}, method, params = [], fetchImpl = fetch, timeoutMs = DEFAULT_RPC_TIMEOUT_MS } = {}) {
  if (!env.RPC_URL) throw new Error('rpc_url_missing');
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('rpc_timeout')); }, timeoutMs); });
    const request = fetchImpl(env.RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), ...(controller ? { signal: controller.signal } : {}) });
    const response = await Promise.race([request, timeout]);
    if (!response.ok) throw new Error(`rpc_http_${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(`rpc_${payload.error.code || 'error'}`);
    return payload.result;
  } finally { clearTimeout(timer); }
}

async function fetchLatestBlock({ env = {}, fetchImpl = fetch, timeoutMs = DEFAULT_RPC_TIMEOUT_MS } = {}) {
  const started = Date.now();
  if (!env.RPC_URL) return { status: 'provider_unavailable', latestBlock: null, observedAt: null, latencyMs: null, provider: 'robinhood-rpc', errorCode: 'rpc_url_missing', freshness: 'unknown' };
  try {
    const result = await rpcCall({ env, method: 'eth_blockNumber', fetchImpl, timeoutMs });
    if (!result || !/^0x[0-9a-f]+$/i.test(result)) throw new Error('rpc_invalid_block');
    const observedAt = new Date().toISOString();
    return { status: 'live', latestBlock: parseInt(result, 16), observedAt, latencyMs: Date.now() - started, provider: 'robinhood-rpc', errorCode: null, freshness: freshness(observedAt) };
  } catch (error) {
    return { status: error?.message === 'rpc_timeout' ? 'provider_timeout' : 'provider_unavailable', latestBlock: null, observedAt: null, latencyMs: Date.now() - started, provider: 'robinhood-rpc', errorCode: error?.message === 'rpc_timeout' ? 'rpc_timeout' : error?.message || 'rpc_request_failed', freshness: 'unknown' };
  }
}

async function getStatus(env, fetchImpl) {
  const result = await fetchLatestBlock({ env, fetchImpl });
  return { ...result, chain: env.CHAIN_NAME || 'Robinhood Chain', chainId: env.CHAIN_ID || DEFAULT_CHAIN_ID };
}

async function getCursor(db, chainId) {
  const row = await db.prepare('SELECT last_processed_block FROM ingestion_cursors WHERE chain_id = ?').bind(chainId).first();
  return Number.isInteger(row?.last_processed_block) ? row.last_processed_block : null;
}

async function indexLatestRange({ env, db, latestBlock, fetchImpl = fetch, now = new Date().toISOString() }) {
  if (!db || !Number.isInteger(latestBlock)) return { status: 'not_indexed', indexed: 0, range: null };
  const chainId = env.CHAIN_ID || DEFAULT_CHAIN_ID;
  const lastProcessed = await getCursor(db, chainId);
  const range = buildBlockRange(lastProcessed, latestBlock, Number(env.INDEX_MAX_BLOCKS) || MAX_INDEX_BLOCKS);
  if (!range) return { status: 'caught_up', indexed: 0, range: null, lastProcessedBlock: lastProcessed };
  try {
    const logs = await rpcCall({ env, method: 'eth_getLogs', params: [{ fromBlock: hexBlock(range.from), toBlock: hexBlock(range.to), topics: [TRANSFER_TOPIC] }], fetchImpl });
    const records = (Array.isArray(logs) ? logs : []).map(decodeTransferLog).filter(Boolean);
    for (const record of records) {
      const eventId = `${record.transactionHash || 'unknown'}:${record.logIndex}`;
      await db.prepare('INSERT OR IGNORE INTO token_transfers (event_id, token_address, from_address, to_address, value_hex, block_number, transaction_hash, log_index, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(eventId, record.tokenAddress, record.from, record.to, record.valueHex, record.blockNumber, record.transactionHash, record.logIndex, now).run();
      await db.prepare(`INSERT INTO assets (address, symbol, name, asset_type, transferability, market_status, last_seen_block, last_updated_at, metadata_json) VALUES (?, NULL, NULL, 'unknown', 'unknown', 'unknown', ?, ?, '{}') ON CONFLICT(address) DO UPDATE SET last_seen_block=excluded.last_seen_block, last_updated_at=excluded.last_updated_at`).bind(record.tokenAddress, record.blockNumber, now).run();
    }
    await db.prepare('INSERT INTO ingestion_cursors (chain_id, last_processed_block, status, updated_at, error_code) VALUES (?, ?, ?, ?, NULL) ON CONFLICT(chain_id) DO UPDATE SET last_processed_block=excluded.last_processed_block, status=excluded.status, updated_at=excluded.updated_at, error_code=NULL').bind(chainId, range.to, 'live', now).run();
    return { status: 'indexed', indexed: records.length, records, range, lastProcessedBlock: range.to };
  } catch (error) {
    await db.prepare('INSERT INTO ingestion_cursors (chain_id, last_processed_block, status, updated_at, error_code) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chain_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, error_code=excluded.error_code').bind(chainId, lastProcessed, 'backfill_error', now, error?.message || 'index_failed').run();
    return { status: 'backfill_error', indexed: 0, range, errorCode: error?.message || 'index_failed' };
  }
}

async function fetchTokenMetadata({ env, address, fetchImpl = fetch }) {
  const call = (data) => rpcCall({ env, method: 'eth_call', params: [{ to: address, data }, 'latest'], fetchImpl });
  const results = await Promise.allSettled([call(metadataCallData.symbol), call(metadataCallData.name), call(metadataCallData.decimals)]);
  const [symbolResult, nameResult, decimalsResult] = results;
  return normalizeMetadata({
    symbol: symbolResult.status === 'fulfilled' ? decodeAbiString(symbolResult.value) : null,
    name: nameResult.status === 'fulfilled' ? decodeAbiString(nameResult.value) : null,
    decimals: decimalsResult.status === 'fulfilled' ? decodeAbiUint(decimalsResult.value) : null,
  });
}

async function enrichTokenMetadata({ env, db, fetchImpl = fetch, now = new Date().toISOString(), limit = MAX_METADATA_ASSETS }) {
  if (!db) return { status: 'database_unavailable', enriched: 0 };
  const assets = await db.prepare("SELECT address FROM assets WHERE metadata_status = 'unknown' OR metadata_status IS NULL ORDER BY last_updated_at DESC LIMIT ?").bind(limit).all();
  let enriched = 0;
  for (const asset of assets.results || []) {
    try {
      const metadata = await fetchTokenMetadata({ env, address: asset.address, fetchImpl });
      await db.prepare('UPDATE assets SET symbol = ?, name = ?, metadata_status = ?, metadata_source = ?, metadata_updated_at = ? WHERE address = ?').bind(metadata.symbol, metadata.name, metadata.status, metadata.source, now, asset.address).run();
      enriched += 1;
    } catch {
      await db.prepare('UPDATE assets SET metadata_status = ?, metadata_source = ?, metadata_updated_at = ? WHERE address = ?').bind('provider_unavailable', 'erc20_contract', now, asset.address).run();
    }
  }
  return { status: 'completed', enriched };
}

async function enrichMarketData({ db, fetchImpl = fetch, now = new Date().toISOString(), limit = MAX_METADATA_ASSETS }) {
  if (!db) return { status: 'database_unavailable', enriched: 0 };
  const assets = await db.prepare("SELECT address FROM assets WHERE market_updated_at IS NULL OR market_updated_at < datetime('now', '-5 minutes') ORDER BY last_updated_at DESC LIMIT ?").bind(limit).all();
  let enriched = 0;
  for (const asset of assets.results || []) {
    try {
      const market = await fetchMarketData({ address: asset.address, fetchImpl });
      await db.prepare('UPDATE assets SET market_status = ?, market_price = ?, market_liquidity_usd = ?, market_source = ?, market_pair_address = ?, market_venue = ?, market_updated_at = ? WHERE address = ?').bind(market.status, market.price, market.liquidityUsd, market.source, market.pairAddress, market.venue, now, asset.address).run();
      enriched += 1;
    } catch (error) {
      await db.prepare('UPDATE assets SET market_status = ?, market_source = ?, market_updated_at = ? WHERE address = ?').bind(marketStatusFromError(error), 'dexscreener', now, asset.address).run();
    }
  }
  return { status: 'completed', enriched };
}

async function marketSummary(db) {
  if (!db) return { status: 'unknown', price: null, liquidityUsd: null, source: null };
  const result = await db.prepare('SELECT market_status FROM assets').all();
  const status = summarizeMarketStatuses((result.results || []).map((row) => row.market_status));
  return { status, price: null, liquidityUsd: null, source: status === 'unknown' ? null : 'dexscreener' };
}

async function listAssets(db, limit = 50) {
  if (!db) return [];
  const result = await db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM token_transfers t WHERE t.token_address = a.address) AS transfer_count, (SELECT COUNT(DISTINCT t.from_address) FROM token_transfers t WHERE t.token_address = a.address) AS unique_senders FROM assets a ORDER BY a.last_updated_at DESC LIMIT ?`).bind(Math.min(Math.max(Number(limit) || 50, 1), 100)).all();
  return result.results || [];
}

async function assetDetail(db, address) {
  if (!db) return null;
  const asset = await db.prepare(`SELECT a.*, (SELECT COUNT(*) FROM token_transfers t WHERE t.token_address = a.address) AS transfer_count, (SELECT COUNT(DISTINCT t.from_address) FROM token_transfers t WHERE t.token_address = a.address) AS unique_senders FROM assets a WHERE a.address = ?`).bind(address.toLowerCase()).first();
  if (!asset) return null;
  const activity = await db.prepare('SELECT * FROM token_transfers WHERE token_address = ? ORDER BY block_number DESC, log_index DESC LIMIT 25').bind(address.toLowerCase()).all();
  const market = classifyMarketData({ price: asset.market_price, liquidityUsd: asset.market_liquidity_usd, source: asset.market_source });
  return { ...asset, activity: activity.results || [], market, passport: buildTradeabilityPassport({ ...asset, transferCount: asset.transfer_count, uniqueSenders: asset.unique_senders, market }) };
}

async function listWatchlist(db) {
  if (!db) return [];
  const result = await db.prepare('SELECT w.*, a.symbol, a.name, a.last_seen_block, a.market_status FROM watchlist w LEFT JOIN assets a ON a.address = w.asset_address ORDER BY w.created_at DESC').all();
  return result.results || [];
}

async function addWatchlist(db, address) {
  const normalized = String(address || '').toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) return { error: 'invalid_asset_address' };
  const exists = await db.prepare('SELECT address FROM assets WHERE address = ?').bind(normalized).first();
  if (!exists) return { error: 'asset_not_found' };
  await db.prepare('INSERT OR IGNORE INTO watchlist (asset_address, created_at) VALUES (?, ?)').bind(normalized, new Date().toISOString()).run();
  return { assetAddress: normalized, status: 'watchlisted' };
}

async function removeWatchlist(db, address) {
  const normalized = String(address || '').toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) return { error: 'invalid_asset_address' };
  await db.prepare('DELETE FROM watchlist WHERE asset_address = ?').bind(normalized).run();
  return { assetAddress: normalized, status: 'removed' };
}

async function listAlerts(db) {
  if (!db) return [];
  const result = await db.prepare('SELECT * FROM alerts ORDER BY created_at DESC').all();
  return result.results || [];
}

async function listAlertEvents(db) {
  if (!db) return [];
  const result = await db.prepare('SELECT * FROM alert_events ORDER BY observed_at DESC LIMIT 100').all();
  return result.results || [];
}

async function addAlert(db, body) {
  const rule = normalizeAlert(body || {});
  if (!rule) return { error: 'invalid_alert_rule' };
  await db.prepare('INSERT INTO alerts (asset_address, kind, threshold, enabled, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(asset_address, kind) DO UPDATE SET threshold=excluded.threshold, enabled=excluded.enabled').bind(rule.assetAddress, rule.kind, rule.threshold, rule.enabled ? 1 : 0, new Date().toISOString()).run();
  return { ...rule, status: 'saved' };
}

async function listPaperTrades(db) {
  if (!db) return [];
  const result = await db.prepare('SELECT * FROM paper_trades ORDER BY created_at DESC LIMIT 100').all();
  return result.results || [];
}

async function addPaperTrade(db, body) {
  const address = String(body?.assetAddress || '').toLowerCase();
  const side = body?.side;
  const quantity = Number(body?.quantity);
  const price = body?.price === null || body?.price === undefined || body?.price === '' ? null : Number(body.price);
  if (!/^0x[a-f0-9]{40}$/.test(address) || !['buy', 'sell'].includes(side) || !Number.isFinite(quantity) || quantity <= 0 || (price !== null && (!Number.isFinite(price) || price < 0))) return { error: 'invalid_paper_trade' };
  await db.prepare('INSERT INTO paper_trades (asset_address, side, quantity, price, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(address, side, quantity, price, body?.note || null, new Date().toISOString()).run();
  return { status: 'paper_trade_saved', assetAddress: address, side, quantity, price };
}

async function paperSummary(db) {
  const trades = await listPaperTrades(db);
  const byAsset = new Map();
  for (const trade of trades) {
    const current = byAsset.get(trade.asset_address) || { assetAddress: trade.asset_address, quantity: 0, invested: 0 };
    const signed = trade.side === 'buy' ? Number(trade.quantity) : -Number(trade.quantity);
    current.quantity += signed;
    if (trade.price !== null) current.invested += (trade.side === 'buy' ? 1 : -1) * Number(trade.quantity) * Number(trade.price);
    byAsset.set(trade.asset_address, current);
  }
  return [...byAsset.values()].map((position) => ({ ...position, currentPrice: null, pnl: calculatePaperPnl({ quantity: position.quantity, entryPrice: position.quantity ? position.invested / position.quantity : null, currentPrice: null }) }));
}

async function evaluateAlerts(db, records = []) {
  if (!db || !records.length) return 0;
  const alerts = await db.prepare('SELECT * FROM alerts WHERE enabled = 1').all();
  let created = 0;
  for (const alert of alerts.results || []) {
    const matches = records.filter((record) => record.tokenAddress === alert.asset_address);
    if (alert.kind === 'transfer_activity' && matches.length >= Number(alert.threshold || 1)) {
      const now = new Date().toISOString();
      await db.prepare('INSERT INTO alert_events (alert_id, asset_address, kind, message, observed_at) VALUES (?, ?, ?, ?, ?)').bind(alert.id, alert.asset_address, alert.kind, `${matches.length} transfer events observed in the latest indexing window`, now).run();
      await db.prepare('UPDATE alerts SET last_triggered_at = ? WHERE id = ?').bind(now, alert.id).run();
      created += 1;
    }
  }
  return created;
}

async function executionPreview(db, body) {
  const address = String(body?.assetAddress || '').toLowerCase();
  const side = body?.side;
  const quantity = Number(body?.quantity);
  if (!/^0x[a-f0-9]{40}$/.test(address) || !['buy', 'sell'].includes(side) || !Number.isFinite(quantity) || quantity <= 0) return { status: 'invalid', error: 'invalid_execution_preview' };
  const asset = await db.prepare('SELECT address, symbol, name FROM assets WHERE address = ?').bind(address).first();
  if (!asset) return { status: 'unknown', error: 'asset_not_found' };
  return { status: 'preview_only', executionEnabled: false, signingRequired: false, broadcasted: false, asset, side, quantity, price: null, slippage: null, gas: null, reason: 'execution layer is intentionally disabled until market routing and transaction simulation are independently verified' };
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return Response.json({ ok: true, service: 'robinhood-chain-terminal' });
  if (url.pathname === '/api/chain-status') return Response.json(await getStatus(env, fetch), { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/assets') return Response.json({ assets: await listAssets(env.DB, url.searchParams.get('limit')), marketData: await marketSummary(env.DB), freshness: env.DB ? 'database' : 'unknown' }, { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/watchlist' && request.method === 'GET') return Response.json({ watchlist: await listWatchlist(env.DB) }, { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/watchlist' && request.method === 'POST') return Response.json(await addWatchlist(env.DB, (await request.json()).assetAddress), { status: 201 });
  if (url.pathname.startsWith('/api/watchlist/') && request.method === 'DELETE') return Response.json(await removeWatchlist(env.DB, url.pathname.slice('/api/watchlist/'.length)));
  if (url.pathname === '/api/alerts' && request.method === 'GET') return Response.json({ alerts: await listAlerts(env.DB) }, { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/alerts' && request.method === 'POST') return Response.json(await addAlert(env.DB, await request.json()), { status: 201 });
  if (url.pathname === '/api/alerts/events' && request.method === 'GET') return Response.json({ events: await listAlertEvents(env.DB) }, { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/paper/trades' && request.method === 'GET') return Response.json({ trades: await listPaperTrades(env.DB) }, { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/paper/trades' && request.method === 'POST') return Response.json(await addPaperTrade(env.DB, await request.json()), { status: 201 });
  if (url.pathname === '/api/paper/summary' && request.method === 'GET') return Response.json({ positions: await paperSummary(env.DB), execution: 'paper_only' }, { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/execution/preview' && request.method === 'POST') return Response.json(await executionPreview(env.DB, await request.json()));
  if (url.pathname.startsWith('/api/assets/')) {
    const detail = await assetDetail(env.DB, decodeURIComponent(url.pathname.slice('/api/assets/'.length)));
    return detail ? Response.json(detail, { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ error: 'asset_not_found' }, { status: 404 });
  }
  return env.ASSETS.fetch(request);
}

async function scheduled(event, env, ctx) {
  ctx.waitUntil((async () => {
    const status = await getStatus(env, fetch);
    if (!env.DB) return;
    await env.DB.prepare(`INSERT INTO chain_status (chain_id, latest_block, observed_at, provider, status, latency_ms, error_code) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(chain_id) DO UPDATE SET latest_block=excluded.latest_block, observed_at=excluded.observed_at, provider=excluded.provider, status=excluded.status, latency_ms=excluded.latency_ms, error_code=excluded.error_code`).bind(status.chainId, status.latestBlock, status.observedAt || new Date().toISOString(), status.provider, status.status, status.latencyMs, status.errorCode).run();
    if (status.status === 'live') {
      const indexed = await indexLatestRange({ env, db: env.DB, latestBlock: status.latestBlock });
      if (indexed.status === 'indexed') await evaluateAlerts(env.DB, indexed.records || []);
      await enrichTokenMetadata({ env, db: env.DB });
      await enrichMarketData({ db: env.DB });
    }
  })());
}

export { fetchLatestBlock, freshness, getStatus, rpcCall, indexLatestRange, enrichTokenMetadata, fetchTokenMetadata, enrichMarketData, listAssets, assetDetail };
export default { fetch: handle, scheduled };
