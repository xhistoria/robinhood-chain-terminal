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
  $('#assets').innerHTML = assets.length ? assets.map((asset) => `<article class="asset"><div><strong>${esc(asset.symbol || 'Unknown asset')}</strong><small>${esc(asset.address)}</small></div><div class="asset-stats"><span>${Number(asset.transfer_count || 0).toLocaleString()} transfers</span><span>${Number(asset.unique_senders || 0).toLocaleString()} senders</span></div><button class="watch" data-address="${esc(asset.address)}">Watch</button><span class="state">${esc(asset.market_status || 'unknown')}</span></article>`).join('') : '<div class="empty">No ERC-20 Transfer events indexed yet. The cron indexer will populate this list.</div>';
  document.querySelectorAll('.watch').forEach((button) => button.addEventListener('click', () => addWatchlist(button.dataset.address)));
}

function renderWatchlist(data) {
  const items = data.watchlist || [];
  $('#watchlist').innerHTML = items.length ? items.map((item) => `<div class="watch-item"><strong>${esc(item.symbol || 'Unknown asset')}</strong><small>${esc(item.asset_address)}</small></div>`).join('') : 'No assets watchlisted.';
}

async function addWatchlist(address) {
  const response = await fetch('/api/watchlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetAddress: address }) });
  const data = await response.json();
  if (data.status === 'watchlisted') await loadWatchlist();
  else alert(data.error || 'Unable to save watchlist');
}

async function loadWatchlist() {
  const response = await fetch('/api/watchlist', { cache: 'no-store' });
  renderWatchlist(await response.json());
}

async function savePaperTrade(event) {
  event.preventDefault();
  const response = await fetch('/api/paper/trades', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetAddress: $('#paper-address').value, side: $('#paper-side').value, quantity: $('#paper-quantity').value, price: $('#paper-price').value || null }) });
  const data = await response.json();
  $('#paper-status').textContent = data.status === 'paper_trade_saved' ? 'Paper trade saved. No transaction was created.' : (data.error || 'Paper trade failed.');
  if (data.status === 'paper_trade_saved') event.target.reset();
}

async function refresh() {
  $('#refresh').disabled = true;
  try {
    const [statusResponse, assetsResponse] = await Promise.all([fetch('/api/chain-status', { cache: 'no-store' }), fetch('/api/assets', { cache: 'no-store' })]);
    renderStatus(await statusResponse.json());
    renderAssets(await assetsResponse.json());
    await loadWatchlist();
  } catch {
    renderStatus({ status: 'api_unavailable', freshness: 'unknown', latestBlock: null });
    $('#asset-count').textContent = 'Unknown';
    $('#assets').innerHTML = '<div class="empty">Asset index unavailable. No data was substituted.</div>';
  } finally { $('#refresh').disabled = false; }
}

$('#refresh').addEventListener('click', refresh);
$('#paper-form').addEventListener('submit', savePaperTrade);
refresh();
setInterval(refresh, 30_000);
