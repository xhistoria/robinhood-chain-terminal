import { TRANSFER_TOPIC, decodeTransferLog, buildBlockRange, hexBlock, classifyMarketData } from './indexer.js';

const DEFAULT_CHAIN_ID = '4663';
const DEFAULT_RPC_TIMEOUT_MS = 3000;
const MAX_INDEX_BLOCKS = 5;

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
    return { status: 'indexed', indexed: records.length, range, lastProcessedBlock: range.to };
  } catch (error) {
    await db.prepare('INSERT INTO ingestion_cursors (chain_id, last_processed_block, status, updated_at, error_code) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chain_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, error_code=excluded.error_code').bind(chainId, lastProcessed, 'backfill_error', now, error?.message || 'index_failed').run();
    return { status: 'backfill_error', indexed: 0, range, errorCode: error?.message || 'index_failed' };
  }
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
  return { ...asset, activity: activity.results || [], market: classifyMarketData() };
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return Response.json({ ok: true, service: 'robinhood-chain-terminal' });
  if (url.pathname === '/api/chain-status') return Response.json(await getStatus(env, fetch), { headers: { 'Cache-Control': 'no-store' } });
  if (url.pathname === '/api/assets') return Response.json({ assets: await listAssets(env.DB, url.searchParams.get('limit')), marketData: classifyMarketData(), freshness: env.DB ? 'database' : 'unknown' }, { headers: { 'Cache-Control': 'no-store' } });
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
    if (status.status === 'live') await indexLatestRange({ env, db: env.DB, latestBlock: status.latestBlock });
  })());
}

export { fetchLatestBlock, freshness, getStatus, rpcCall, indexLatestRange, listAssets, assetDetail };
export default { fetch: handle, scheduled };
