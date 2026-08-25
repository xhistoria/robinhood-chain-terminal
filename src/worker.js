const DEFAULT_CHAIN_ID = '4663';
const DEFAULT_RPC_TIMEOUT_MS = 3000;

function freshness(observedAt, now = Date.now()) {
  if (!observedAt) return 'unknown';
  const age = now - Date.parse(observedAt);
  if (!Number.isFinite(age) || age < 0) return 'unknown';
  return age <= 30_000 ? 'live' : age <= 120_000 ? 'delayed' : 'stale';
}

async function fetchLatestBlock({ env = {}, fetchImpl = fetch, timeoutMs = DEFAULT_RPC_TIMEOUT_MS } = {}) {
  if (!env.RPC_URL) return { status: 'provider_unavailable', latestBlock: null, observedAt: null, latencyMs: null, provider: 'robinhood-rpc', errorCode: 'rpc_url_missing', freshness: 'unknown' };
  const started = Date.now();
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('rpc_timeout')); }, timeoutMs); });
    const request = fetchImpl(env.RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const response = await Promise.race([request, timeout]);
    if (!response.ok) throw new Error(`rpc_http_${response.status}`);
    const payload = await response.json();
    if (!payload?.result || !/^0x[0-9a-f]+$/i.test(payload.result)) throw new Error('rpc_invalid_block');
    const observedAt = new Date().toISOString();
    return { status: 'live', latestBlock: parseInt(payload.result, 16), observedAt, latencyMs: Date.now() - started, provider: 'robinhood-rpc', errorCode: null, freshness: freshness(observedAt) };
  } catch (error) {
    return { status: error?.message === 'rpc_timeout' ? 'provider_timeout' : 'provider_unavailable', latestBlock: null, observedAt: null, latencyMs: Date.now() - started, provider: 'robinhood-rpc', errorCode: error?.message === 'rpc_timeout' ? 'rpc_timeout' : 'rpc_request_failed', freshness: 'unknown' };
  } finally { clearTimeout(timer); }
}

async function getStatus(env, fetchImpl) {
  const result = await fetchLatestBlock({ env, fetchImpl });
  return { ...result, chain: env.CHAIN_NAME || 'Robinhood Chain', chainId: env.CHAIN_ID || DEFAULT_CHAIN_ID };
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return Response.json({ ok: true, service: 'robinhood-chain-terminal' });
  if (url.pathname === '/api/chain-status') return Response.json(await getStatus(env, fetch), { headers: { 'Cache-Control': 'no-store' } });
  return env.ASSETS.fetch(request);
}

async function scheduled(event, env, ctx) {
  ctx.waitUntil(getStatus(env, fetch).then(async (status) => {
    if (!env.DB) return;
    await env.DB.prepare(`INSERT INTO chain_status (chain_id, latest_block, observed_at, provider, status, latency_ms, error_code) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(chain_id) DO UPDATE SET latest_block=excluded.latest_block, observed_at=excluded.observed_at, provider=excluded.provider, status=excluded.status, latency_ms=excluded.latency_ms, error_code=excluded.error_code`).bind(status.chainId, status.latestBlock, status.observedAt || new Date().toISOString(), status.provider, status.status, status.latencyMs, status.errorCode).run();
  }));
}

export { fetchLatestBlock, freshness, getStatus };
export default { fetch: handle, scheduled };
