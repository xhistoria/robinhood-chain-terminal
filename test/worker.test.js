import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLatestBlock, freshness } from '../src/worker.js';

test('returns an explicit provider-unavailable state without RPC URL', async () => {
  const result = await fetchLatestBlock({ env: {}, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.equal(result.status, 'provider_unavailable');
  assert.equal(result.latestBlock, null);
});

test('normalizes a JSON-RPC block response', async () => {
  const result = await fetchLatestBlock({ env: { RPC_URL: 'https://rpc.example' }, fetchImpl: async () => ({ ok: true, async json() { return { jsonrpc: '2.0', id: 1, result: '0x2a' }; } }) });
  assert.equal(result.status, 'live');
  assert.equal(result.latestBlock, 42);
});

test('labels freshness explicitly', () => {
  assert.equal(freshness(null), 'unknown');
  assert.equal(freshness(new Date(Date.now() - 5_000).toISOString()), 'live');
  assert.equal(freshness(new Date(Date.now() - 180_000).toISOString()), 'stale');
});
