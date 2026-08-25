const ALERT_KINDS = new Set(['transfer_activity', 'new_asset', 'market_data_available']);

export function buildTradeabilityPassport(asset = {}) {
  const transferCount = Number(asset.transferCount || 0);
  const uniqueSenders = Number(asset.uniqueSenders || 0);
  const marketStatus = asset.market?.status || 'unknown';
  const activity = transferCount > 0 ? 'observed' : 'unknown';
  const transferability = asset.transferability || 'unknown';
  const issuer = asset.issuer || 'unknown';
  const underlying = asset.underlying || 'unknown';
  const coverage = marketStatus === 'live' && activity === 'observed' && transferability !== 'unknown' && issuer !== 'unknown' && underlying !== 'unknown' ? 'strong' : activity === 'observed' ? 'partial' : 'limited';
  return {
    address: asset.address || null,
    coverage,
    marketData: marketStatus,
    transferActivity: activity,
    transferCount,
    uniqueSenders,
    transferability: asset.transferability || 'unknown',
    issuer: asset.issuer || 'unknown',
    underlying: asset.underlying || 'unknown',
    manualReview: coverage !== 'strong',
    unknowns: [
      ...(marketStatus === 'unknown' ? ['market_price', 'liquidity'] : []),
      ...((asset.transferability || 'unknown') === 'unknown' ? ['transferability'] : []),
      ...((asset.issuer || 'unknown') === 'unknown' ? ['issuer'] : []),
      ...((asset.underlying || 'unknown') === 'unknown' ? ['underlying'] : []),
    ],
  };
}

export function calculatePaperPnl({ quantity, entryPrice, currentPrice } = {}) {
  if (quantity === null || quantity === undefined || entryPrice === null || entryPrice === undefined || currentPrice === null || currentPrice === undefined) return { invested: null, currentValue: null, pnlAbsolute: null, pnlPercent: null, status: 'unknown' };
  const q = Number(quantity);
  const entry = Number(entryPrice);
  const current = Number(currentPrice);
  if (![q, entry, current].every(Number.isFinite) || q <= 0 || entry < 0 || current < 0) return { invested: null, currentValue: null, pnlAbsolute: null, pnlPercent: null, status: 'unknown' };
  const invested = q * entry;
  const currentValue = q * current;
  const pnlAbsolute = currentValue - invested;
  return { invested, currentValue, pnlAbsolute, pnlPercent: invested === 0 ? null : (pnlAbsolute / invested) * 100, status: 'calculated' };
}

export function normalizeAlert({ assetAddress, kind, threshold = null, enabled = true } = {}) {
  if (!assetAddress || typeof assetAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(assetAddress) || !ALERT_KINDS.has(kind)) return null;
  const normalizedThreshold = threshold === null ? null : Number(threshold);
  if (normalizedThreshold !== null && (!Number.isFinite(normalizedThreshold) || normalizedThreshold < 0)) return null;
  return { assetAddress: assetAddress.toLowerCase(), kind, threshold: normalizedThreshold, enabled: Boolean(enabled) };
}
