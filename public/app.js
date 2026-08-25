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
  const marketStatus = data.marketData?.status || 'unknown';
  $('#market-note').textContent = marketStatus === 'unknown' ? 'Market coverage: Unknown — no pair was returned by the provider.' : marketStatus === 'provider_unavailable' ? 'Market provider: Unavailable — price and liquidity are withheld.' : marketStatus === 'provider_timeout' ? 'Market provider: Timeout — price and liquidity are withheld.' : `Market data: ${marketStatus}`;
  $('#assets').innerHTML = assets.length ? assets.map((asset) => `<article class="asset"><div><strong>${esc(asset.symbol || 'Unknown asset')}</strong><small>${esc(asset.address)}</small></div><div class="asset-stats"><span>${Number(asset.transfer_count || 0).toLocaleString()} transfers</span><span>${Number(asset.unique_senders || 0).toLocaleString()} senders</span></div><button class="passport-button" data-address="${esc(asset.address)}"><i class="ph ph-identification-card" aria-hidden="true"></i> Passport</button><button class="watch" data-address="${esc(asset.address)}"><i class="ph ph-eye" aria-hidden="true"></i> Watch</button><span class="state">${esc(asset.market_status || 'unknown')}</span></article>`).join('') : '<div class="empty">No ERC-20 Transfer events indexed yet. The cron indexer will populate this list.</div>';
  document.querySelectorAll('.watch').forEach((button) => button.addEventListener('click', () => addWatchlist(button.dataset.address)));
  document.querySelectorAll('.passport-button').forEach((button) => button.addEventListener('click', () => loadPassport(button.dataset.address)));
}

async function loadPassport(address) {
  const response = await fetch(`/api/assets/${encodeURIComponent(address)}`, { cache: 'no-store' });
  const data = await response.json();
  const passport = data.passport;
  if (!passport) { $('#passport-view').textContent = data.error || 'Passport unavailable'; return; }
  $('#passport-view').innerHTML = `<div class="passport-head"><div><span class="kicker">PASSPORT</span><strong>${esc(passport.address)}</strong></div><span class="state">${esc(passport.coverage)}</span></div><div class="passport-grid"><span>Transfer activity<strong>${esc(passport.transferActivity)}</strong></span><span>Market data<strong>${esc(passport.marketData)}</strong></span><span>Transferability<strong>${esc(passport.transferability)}</strong></span><span>Manual review<strong>${passport.manualReview ? 'Required' : 'Not required'}</strong></span></div><small>Unknown fields: ${esc(passport.unknowns.join(', ') || 'none')}</small>`;
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

async function saveAlert(event) {
  event.preventDefault();
  const threshold = $('#alert-threshold').value;
  const response = await fetch('/api/alerts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assetAddress: $('#alert-address').value, kind: $('#alert-kind').value, threshold: threshold === '' ? null : Number(threshold) }) });
  const data = await response.json();
  $('#alert-status').textContent = data.status === 'saved' ? 'Alert saved. It will be evaluated on the next Cron run.' : (data.error || 'Unable to save alert.');
  if (data.status === 'saved') { event.target.reset(); await loadAlerts(); }
}

async function loadAlerts() {
  const [rulesResponse, eventsResponse] = await Promise.all([fetch('/api/alerts', { cache: 'no-store' }), fetch('/api/alerts/events', { cache: 'no-store' })]);
  const rules = await rulesResponse.json();
  const events = await eventsResponse.json();
  $('#alert-status').textContent = `${(rules.alerts || []).length} alert rule(s) configured.`;
  $('#alert-events').innerHTML = (events.events || []).length ? events.events.map((event) => `<div class="watch-item"><strong>${esc(event.kind)}</strong><small>${esc(event.asset_address)} · ${esc(event.message)}</small></div>`).join('') : 'No alert events.';
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
    await loadAlerts();
  } catch {
    renderStatus({ status: 'api_unavailable', freshness: 'unknown', latestBlock: null });
    $('#asset-count').textContent = 'Unknown';
    $('#assets').innerHTML = '<div class="empty">Asset index unavailable. No data was substituted.</div>';
  } finally { $('#refresh').disabled = false; }
}

$('#refresh').addEventListener('click', refresh);
$('#paper-form').addEventListener('submit', savePaperTrade);
$('#alert-form').addEventListener('submit', saveAlert);
refresh();
setInterval(refresh, 30_000);
