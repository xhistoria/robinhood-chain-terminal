export function normalizeMarketResponse(payload = {}) {
  const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
  const pair = pairs.find((item) => Number.isFinite(Number(item?.priceUsd)) || Number.isFinite(Number(item?.liquidity?.usd))) || null;
  if (!pair) return { status: 'unknown', price: null, liquidityUsd: null, source: 'dexscreener', pairAddress: null, venue: null, chainId: null };
  const price = Number.isFinite(Number(pair.priceUsd)) ? Number(pair.priceUsd) : null;
  const liquidityUsd = Number.isFinite(Number(pair.liquidity?.usd)) ? Number(pair.liquidity.usd) : null;
  return { status: price !== null && liquidityUsd !== null ? 'live' : 'partial', price, liquidityUsd, source: 'dexscreener', pairAddress: pair.pairAddress || null, venue: pair.dexId || null, chainId: pair.chainId || null };
}

export function marketStatusFromError(error) {
  return error?.message === 'market_timeout' ? 'provider_timeout' : 'provider_unavailable';
}

export async function fetchMarketData({ address, fetchImpl = fetch, timeoutMs = 2500 } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  try {
    const request = fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(address)}`, { headers: { accept: 'application/json' }, ...(controller ? { signal: controller.signal } : {}) });
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new Error('market_timeout')); }, timeoutMs); });
    const response = await Promise.race([request, timeout]);
    if (!response.ok) throw new Error(`market_http_${response.status}`);
    return normalizeMarketResponse(await response.json());
  } finally { clearTimeout(timer); }
}
