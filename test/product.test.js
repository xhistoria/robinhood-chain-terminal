import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradeabilityPassport, calculatePaperPnl, normalizeAlert } from '../src/product.js';

test('builds a transparent passport without opaque risk score', () => {
  const passport = buildTradeabilityPassport({ address: '0xabc', transferCount: 12, uniqueSenders: 4, market: { status: 'unknown' } });
  assert.equal(passport.address, '0xabc');
  assert.equal(passport.coverage, 'partial');
  assert.equal(passport.marketData, 'unknown');
  assert.equal(passport.transferActivity, 'observed');
  assert.equal(passport.manualReview, true);
  assert.equal('riskScore' in passport, false);
});

test('calculates paper P/L only from explicit entry and current values', () => {
  assert.deepEqual(calculatePaperPnl({ quantity: 2, entryPrice: 10, currentPrice: 12 }), { invested: 20, currentValue: 24, pnlAbsolute: 4, pnlPercent: 20, status: 'calculated' });
  assert.equal(calculatePaperPnl({ quantity: 2, entryPrice: 10, currentPrice: null }).status, 'unknown');
});

test('normalizes an allowlisted alert rule', () => {
  const address = `0x${'AB'.repeat(20)}`;
  assert.deepEqual(normalizeAlert({ assetAddress: address, kind: 'transfer_activity', threshold: 10 }), { assetAddress: address.toLowerCase(), kind: 'transfer_activity', threshold: 10, enabled: true });
  assert.equal(normalizeAlert({ assetAddress: address, kind: 'unknown' }), null);
});
