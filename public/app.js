const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

function renderStatus(data) {
  const status = data.status || 'unknown';
  $('#status').textContent = status.replaceAll('_', ' ');
  $('#status-detail').textContent = data.errorCode || data.provider || 'No provider detail';
  $('#block').textContent = data.latestBlock === null || data.latestBlock === undefined ? 'Unknown' : data.latestBlock.toLocaleString();
  $('#block-detail').textContent = data.observedAt ? `${data.freshness} · ${new Date(data.observedAt).toLocaleTimeString()}` : 'No confirmed observation';
  $('#latency').textContent = data.latencyMs === null || data.latencyMs === undefined ? 'Unknown' : `${data.latencyMs} ms`;
}

function renderAssets(data) {
  const assets = data.assets || [];
  $('#asset-count').textContent = assets.length.toLocaleString();
  $('#asset-detail').textContent = data.freshness === 'database' ? 'Persisted transfer index' : 'Database unavailable';
  $('#market-note').textContent = data.marketData?.status === 'unknown' ? 'Market price and liquidity: Unknown — no supported market provider is configured.' : `Market data: ${data.marketData.status}`;
  $('#assets').innerHTML = assets.length ? assets.map((asset) => `<article class="asset"><div><strong>${esc(asset.symbol || 'Unknown asset')}</strong><small>${esc(asset.address)}</small></div><div class="asset-stats"><span>${Number(asset.transfer_count || 0).toLocaleString()} transfers</span><span>${Number(asset.unique_senders || 0).toLocaleString()} senders</span></div><span class="state">${esc(asset.market_status || 'unknown')}</span></article>`).join('') : '<div class="empty">No ERC-20 Transfer events indexed yet. The cron indexer will populate this list.</div>';
}

async function refresh() {
  $('#refresh').disabled = true;
  try {
    const [statusResponse, assetsResponse] = await Promise.all([fetch('/api/chain-status', { cache: 'no-store' }), fetch('/api/assets', { cache: 'no-store' })]);
    renderStatus(await statusResponse.json());
    renderAssets(await assetsResponse.json());
  } catch {
    renderStatus({ status: 'api_unavailable', freshness: 'unknown', latestBlock: null });
    $('#asset-count').textContent = 'Unknown';
    $('#assets').innerHTML = '<div class="empty">Asset index unavailable. No data was substituted.</div>';
  } finally { $('#refresh').disabled = false; }
}

$('#refresh').addEventListener('click', refresh);
refresh();
setInterval(refresh, 30_000);
