export const metadataCallData = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
};

function hexBytes(value) {
  const clean = String(value || '').replace(/^0x/, '');
  return clean.length % 2 === 0 ? clean : `0${clean}`;
}

export function decodeAbiString(value) {
  const hex = hexBytes(value);
  if (!hex || hex.length < 128) return null;
  const offset = Number.parseInt(hex.slice(0, 64), 16) * 2;
  const length = Number.parseInt(hex.slice(offset, offset + 64), 16);
  if (!Number.isFinite(length) || length < 0) return null;
  const bytes = hex.slice(offset + 64, offset + 64 + length * 2);
  try { return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) || [], (byte) => Number.parseInt(byte, 16))); } catch { return null; }
}

export function decodeAbiUint(value) {
  const hex = hexBytes(value);
  if (!hex) return null;
  const parsed = Number.parseInt(hex.slice(-64), 16);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function metadataStatus({ symbol = null, name = null, decimals = null } = {}) {
  return symbol || name || Number.isInteger(decimals) ? { status: 'observed', source: 'erc20_contract' } : { status: 'unknown', source: null };
}

export function normalizeMetadata({ symbol, name, decimals } = {}) {
  const normalized = {
    symbol: typeof symbol === 'string' && symbol.trim() ? symbol.trim().slice(0, 64) : null,
    name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 128) : null,
    decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : null,
  };
  return { ...normalized, ...metadataStatus(normalized) };
}
