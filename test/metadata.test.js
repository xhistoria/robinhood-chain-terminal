import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiString, decodeAbiUint, metadataStatus, metadataCallData } from '../src/metadata.js';

test('decodes ABI dynamic string metadata', () => {
  const value = 'ROBIN';
  const bytes = Buffer.from(value, 'utf8').toString('hex');
  const encoded = `0x${'0'.repeat(62)}20${'0'.repeat(63)}5${bytes.padEnd(64, '0')}`;
  assert.equal(decodeAbiString(encoded), value);
});

test('decodes ABI uint metadata', () => {
  assert.equal(decodeAbiUint('0x' + '0'.repeat(63) + '12'), 18);
});

test('uses explicit selectors for ERC-20 metadata', () => {
  assert.deepEqual(metadataCallData, { name: '0x06fdde03', symbol: '0x95d89b41', decimals: '0x313ce567' });
});

test('metadata status exposes unknown and observed coverage', () => {
  assert.deepEqual(metadataStatus({}), { status: 'unknown', source: null });
  assert.deepEqual(metadataStatus({ symbol: 'R', name: 'Robin', decimals: 18 }), { status: 'observed', source: 'erc20_contract' });
});
