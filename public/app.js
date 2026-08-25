const $ = (selector) => document.querySelector(selector);

function render(data) {
  const status = data.status || 'unknown';
  $('#status').textContent = status.replaceAll('_', ' ');
  $('#status-detail').textContent = data.errorCode || data.provider || 'No provider detail';
  $('#block').textContent = data.latestBlock === null || data.latestBlock === undefined ? 'Unknown' : data.latestBlock.toLocaleString();
  $('#block-detail').textContent = data.observedAt ? `${data.freshness} · ${new Date(data.observedAt).toLocaleTimeString()}` : 'No confirmed observation';
  $('#latency').textContent = data.latencyMs === null || data.latencyMs === undefined ? 'Unknown' : `${data.latencyMs} ms`;
}

async function refresh() {
  $('#refresh').disabled = true;
  try {
    const response = await fetch('/api/chain-status', { cache: 'no-store' });
    render(await response.json());
  } catch {
    render({ status: 'api_unavailable', freshness: 'unknown', latestBlock: null });
  } finally { $('#refresh').disabled = false; }
}

$('#refresh').addEventListener('click', refresh);
refresh();
setInterval(refresh, 30_000);
