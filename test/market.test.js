import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarketResponse, marketStatusFromError, summarizeMarketStatuses } from '../src/market.js';

test('normalizes a real market pair without inventing missing fields', () => {
  const result = normalizeMarketResponse({ pairs: [{ chainId: 'robinhood', dexId: 'example', priceUsd: '1.25', liquidity: { usd: 4200 }, pairAddress: '0xpair' }] });
  assert.deepEqual(result, { status: 'live', price: 1.25, liquidityUsd: 4200, source: 'dexscreener', pairAddress: '0xpair', venue: 'example', chainId: 'robinhood' });
});

test('keeps market data unknown when provider has no pair', () => {
  assert.deepEqual(normalizeMarketResponse({ pairs: [] }), { status: 'unknown', price: null, liquidityUsd: null, source: 'dexscreener', pairAddress: null, venue: null, chainId: null });
});

test('maps provider failures explicitly', () => {
  assert.equal(marketStatusFromError(new Error('market_timeout')), 'provider_timeout');
  assert.equal(marketStatusFromError(new Error('market_http_503')), 'provider_unavailable');
});

test('summarizes provider coverage without hiding failures', () => {
  assert.equal(summarizeMarketStatuses(['provider_unavailable', 'unknown']), 'provider_unavailable');
  assert.equal(summarizeMarketStatuses(['live', 'unknown']), 'live');
  assert.equal(summarizeMarketStatuses([]), 'unknown');
});
