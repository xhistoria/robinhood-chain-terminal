import test from 'node:test';
import assert from 'node:assert/strict';
import { TRANSFER_TOPIC, decodeTransferLog, buildBlockRange, classifyMarketData } from '../src/indexer.js';

test('decodes an ERC-20 Transfer log into a normalized activity record', () => {
  const address = '0x' + 'ab'.repeat(20);
  const from = '0x' + '01'.repeat(20);
  const to = '0x' + '02'.repeat(20);
  const value = '0x' + '0f'.repeat(32);
  const log = { address, topics: [TRANSFER_TOPIC, `0x${'0'.repeat(24)}${from.slice(2)}`, `0x${'0'.repeat(24)}${to.slice(2)}`], data: value, blockNumber: '0x2a', transactionHash: '0x' + 'cd'.repeat(32), logIndex: '0x3' };
  const result = decodeTransferLog(log);
  assert.deepEqual(result, { tokenAddress: address, from, to, valueHex: value, blockNumber: 42, transactionHash: log.transactionHash, logIndex: 3 });
});

test('bounds an RPC block range for safe cron processing', () => {
  assert.deepEqual(buildBlockRange(100, 150, 20), { from: 131, to: 150 });
  assert.deepEqual(buildBlockRange(null, 150, 20), { from: 131, to: 150 });
  assert.deepEqual(buildBlockRange(150, 150, 20), null);
});

test('does not invent price or liquidity when no market provider exists', () => {
  assert.deepEqual(classifyMarketData({}), { status: 'unknown', price: null, liquidityUsd: null, source: null });
  assert.deepEqual(classifyMarketData({ price: 1.2, source: 'unknown' }), { status: 'partial', price: 1.2, liquidityUsd: null, source: 'unknown' });
});
