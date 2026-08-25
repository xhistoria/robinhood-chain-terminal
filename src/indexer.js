export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export function decodeTransferLog(log) {
  if (!log?.address || log.topics?.length < 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC) return null;
  const topicAddress = (topic) => `0x${topic.slice(-40)}`.toLowerCase();
  return {
    tokenAddress: log.address.toLowerCase(),
    from: topicAddress(log.topics[1]),
    to: topicAddress(log.topics[2]),
    valueHex: log.data || '0x0',
    blockNumber: Number.parseInt(log.blockNumber, 16),
    transactionHash: log.transactionHash || null,
    logIndex: Number.parseInt(log.logIndex, 16),
  };
}

export function buildBlockRange(lastProcessed, latestBlock, maxBlocks = 50) {
  if (!Number.isInteger(latestBlock) || latestBlock < 0) return null;
  const previous = Number.isInteger(lastProcessed) ? lastProcessed : latestBlock - maxBlocks;
  const from = Math.max(previous + 1, latestBlock - maxBlocks + 1);
  return from > latestBlock ? null : { from, to: latestBlock };
}

export function classifyMarketData({ price = null, liquidityUsd = null, source = null } = {}) {
  const validPrice = price !== null && Number.isFinite(Number(price)) ? Number(price) : null;
  const validLiquidity = liquidityUsd !== null && Number.isFinite(Number(liquidityUsd)) ? Number(liquidityUsd) : null;
  const status = validPrice !== null && validLiquidity !== null ? 'live' : validPrice !== null || validLiquidity !== null ? 'partial' : 'unknown';
  return { status, price: validPrice, liquidityUsd: validLiquidity, source: source || null };
}

export function hexBlock(number) { return `0x${Number(number).toString(16)}`; }
