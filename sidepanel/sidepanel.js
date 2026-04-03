// Side panel controller
let currentTabId = null;
let currentState = null;

// --- DOM refs ---
const statusBadge = document.getElementById('statusBadge');
const pickToggle = document.getElementById('pickToggle');
const clearAllBtn = document.getElementById('clearAll');
const elementList = document.getElementById('elementList');
const extractBtn = document.getElementById('extractBtn');
const progressSection = document.getElementById('progressSection');
const progressText = document.getElementById('progressText');
const progressBar = document.getElementById('progressBar');
const stopBtn = document.getElementById('stopBtn');
const resultCount = document.getElementById('resultCount');
const resultsTable = document.getElementById('resultsTable');
const paginationConfig = document.getElementById('paginationConfig');
const listConfig = document.getElementById('listConfig');
const scrollConfig = document.getElementById('scrollConfig');
const markNextBtn = document.getElementById('markNextBtn');
const markListBtn = document.getElementById('markListBtn');
const nextBtnStatus = document.getElementById('nextBtnStatus');
const listItemStatus = document.getElementById('listItemStatus');
const maxPagesInput = document.getElementById('maxPages');
const maxScrollsInput = document.getElementById('maxScrolls');
const scrollDelayInput = document.getElementById('scrollDelay');
const assembledConfig = document.getElementById('assembledConfig');
const assembledMaxCasesInput = document.getElementById('assembledMaxCases');
const assembledMaxPagesInput = document.getElementById('assembledMaxPages');
const saveToLibrary = document.getElementById('saveToLibrary');
const libraryList = document.getElementById('libraryList');

// --- Tabs ---
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// --- Init ---
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
    chrome.runtime.sendMessage({ type: 'GET_STATE', tabId: currentTabId }, (res) => {
      if (res?.state) {
        currentState = res.state;
        render();
      }
    });
  }
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentTabId = activeInfo.tabId;
  chrome.runtime.sendMessage({ type: 'GET_STATE', tabId: currentTabId }, (res) => {
    if (res?.state) {
      currentState = res.state;
      render();
    }
  });
});

// --- Render ---
function render() {
  if (!currentState) return;

  // Status badge
  const statusMap = {
    idle: 'badge-idle',
    picking: 'badge-picking',
    extracting: 'badge-extracting',
    iterating: 'badge-iterating',
  };
  const statusText = {
    idle: 'Idle', picking: 'Picking', extracting: 'Extracting', iterating: 'Iterating',
  };
  statusBadge.className = `badge ${statusMap[currentState.status] || 'badge-idle'}`;
  statusBadge.textContent = statusText[currentState.status] || 'Idle';

  // Pick button
  if (currentState.pickMode) {
    pickToggle.innerHTML = `<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Stop Picking`;
    pickToggle.className = 'btn btn-pick picking';
  } else {
    pickToggle.innerHTML = `<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg> Start Picking`;
    pickToggle.className = 'btn btn-primary btn-pick';
  }

  renderElementList();

  // Mode configs (must be before extract button check)
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'single';

  // Extract button - Assembled mode doesn't need manual selections
  const isAssembled = mode === 'assembled';
  extractBtn.disabled = (!isAssembled && !currentState.selectedElements?.length) ||
    currentState.status === 'extracting' || currentState.status === 'iterating';

  // Progress
  if (currentState.status === 'extracting' || currentState.status === 'iterating') {
    progressSection.classList.remove('hidden');
  } else {
    progressSection.classList.add('hidden');
  }

  // Mode visibility
  paginationConfig.classList.toggle('hidden', mode !== 'pagination');
  listConfig.classList.toggle('hidden', mode !== 'list');
  scrollConfig.classList.toggle('hidden', mode !== 'scroll');
  assembledConfig.classList.toggle('hidden', mode !== 'assembled');

  if (currentState.iterationConfig?.nextButtonSelector) {
    nextBtnStatus.textContent = currentState.iterationConfig.nextButtonSelector;
  }
  if (currentState.iterationConfig?.listItemSelector) {
    listItemStatus.textContent = currentState.iterationConfig.listItemSelector;
  }

  const count = currentState.resultCount || currentState.results?.length || 0;
  resultCount.textContent = `(${count})`;

  renderResults();

  // Save button
  const hasResults = (currentState.results?.length || 0) > 0;
  saveToLibrary.classList.toggle('hidden', !hasResults);
}

function renderElementList() {
  const els = currentState?.selectedElements || [];
  if (els.length === 0) {
    elementList.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
      <span>Click elements on the page to select them</span>
    </div>`;
    return;
  }

  elementList.innerHTML = els.map((el, i) => `
    <div class="element-card">
      <div class="element-card-body">
        <div class="element-card-top">
          <span class="element-tag">${esc(el.tagName || 'el')}</span>
          <input class="element-label" value="${esc(el.label)}" data-index="${i}" data-selector="${esc(el.selector)}">
        </div>
        <div class="element-selector">${esc(el.selector)}</div>
        <div class="element-preview">${esc(el.preview || '')}</div>
      </div>
      <button class="element-remove" data-selector="${esc(el.selector)}" title="Remove">&times;</button>
    </div>
  `).join('');

  elementList.querySelectorAll('.element-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'REMOVE_SELECTION',
        tabId: currentTabId,
        selector: btn.dataset.selector,
      });
    });
  });

  elementList.querySelectorAll('.element-label').forEach(input => {
    input.addEventListener('change', () => {
      if (currentState?.selectedElements) {
        const idx = parseInt(input.dataset.index);
        if (currentState.selectedElements[idx]) {
          currentState.selectedElements[idx].label = input.value;
        }
      }
    });
  });
}

function renderResults() {
  const results = currentState?.results || [];
  if (results.length === 0) {
    resultsTable.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>
      <span>No results yet</span>
    </div>`;
    return;
  }

  // Check if this is Assembled data (has messages array)
  if (results[0]?.messages) {
    renderAssembledResults(results);
    return;
  }

  const labels = Object.keys(results[0] || {});
  if (labels.length === 0) return;

  let html = '<table class="results-table"><thead><tr>';
  labels.forEach(l => { html += `<th>${esc(l)}</th>`; });
  html += '</tr></thead><tbody>';

  results.forEach((row) => {
    html += '<tr>';
    labels.forEach(l => {
      const val = row[l];
      const text = val?.text || val || '';
      html += `<td>${esc(String(text))}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  resultsTable.innerHTML = html;
}

function renderAssembledResults(results) {
  let html = '<table class="results-table"><thead><tr>';
  html += '<th>#</th><th>Title</th><th>Case ID</th><th>AI Exp.</th><th>Resolution</th><th>Messages</th>';
  html += '</tr></thead><tbody>';

  results.forEach((caseData, i) => {
    const msgCount = caseData.messages?.length || 0;
    html += '<tr>';
    html += `<td>${i + 1}</td>`;
    html += `<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(caseData.title || '')}</td>`;
    html += `<td style="font-size:11px">${esc(caseData.case_id || '')}</td>`;
    html += `<td>${esc(caseData.aiExperience || '')}</td>`;
    html += `<td>${esc(caseData.resolution || '')}</td>`;
    html += `<td>${msgCount}</td>`;
    html += '</tr>';
  });

  html += '</tbody></table>';
  resultsTable.innerHTML = html;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildAssembledHTML(results) {
  const badgeColor = (val) => {
    const v = (val || '').toLowerCase();
    if (v === 'poor' || v === 'frustrated' || v === 'degraded' || v === 'dead end' || v === 'not resolved') return '#ef4444';
    if (v === 'excellent' || v === 'delighted' || v === 'one-shot' || v === 'fully resolved') return '#22c55e';
    if (v === 'good' || v === 'neutral' || v === 'direct') return '#3b82f6';
    if (v === 'looping' || v === 'frictional') return '#f59e0b';
    return '#6b7280';
  };

  const previewMsg = (msgs) => {
    if (!msgs || msgs.length === 0) return '<span style="color:#6b7280">No messages</span>';
    const first = msgs[0];
    const text = escHtml(first.content || '').substring(0, 80);
    return `<span style="color:#9ca3af">${escHtml(first.role === 'customer' ? 'Customer' : 'AI')}:</span> ${text}${first.content?.length > 80 ? '...' : ''}`;
  };

  let tableRows = '';
  results.forEach((c, i) => {
    const msgCount = c.messages?.length || 0;
    tableRows += `
      <tr class="case-row" data-index="${i}" onclick="openDrawer(${i})">
        <td>${i + 1}</td>
        <td class="title-cell">${escHtml(c.title)}</td>
        <td class="mono">${escHtml(c.case_id)}</td>
        <td><span class="badge" style="background:${badgeColor(c.aiExperience)}">${escHtml(c.aiExperience || '—')}</span></td>
        <td><span class="badge" style="background:${badgeColor(c.resolution)}">${escHtml(c.resolution || '—')}</span></td>
        <td><span class="badge" style="background:${badgeColor(c.efficiency)}">${escHtml(c.efficiency || '—')}</span></td>
        <td><span class="badge" style="background:${badgeColor(c.sentiment)}">${escHtml(c.sentiment || '—')}</span></td>
        <td>${msgCount}</td>
        <td class="preview-cell">${previewMsg(c.messages)}</td>
      </tr>`;
  });

  // Build conversations JSON for the drawer
  const casesJSON = JSON.stringify(results.map(c => ({
    title: c.title || '',
    case_id: c.case_id || '',
    created_at: c.created_at || '',
    aiExperience: c.aiExperience || '',
    resolution: c.resolution || '',
    efficiency: c.efficiency || '',
    sentiment: c.sentiment || '',
    user_id: c.user_id || '',
    ai_agent: c.ai_agent || '',
    channel: c.channel || '',
    type: c.type || '',
    outcome: c.outcome || '',
    messages: (c.messages || []).map(m => ({
      role: m.role || 'other',
      sender: m.sender || '',
      timestamp: m.timestamp || '',
      content: m.content || '',
    })),
  })));

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Assembled QA - ${results.length} cases</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
  .header{padding:20px 24px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;background:#0f172a;position:sticky;top:0;z-index:10}
  .header h1{font-size:20px;font-weight:700;color:#f1f5f9}
  .header .stats{display:flex;gap:16px;font-size:13px;color:#94a3b8}
  .header .stats span{background:#1e293b;padding:4px 10px;border-radius:6px}
  .container{padding:16px 24px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead{position:sticky;top:65px;z-index:5}
  th{background:#1e293b;color:#94a3b8;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;padding:10px 12px;text-align:left;border-bottom:2px solid #334155}
  td{padding:10px 12px;border-bottom:1px solid #1e293b;vertical-align:top}
  .case-row{cursor:pointer;transition:background 0.15s}
  .case-row:hover{background:#1e293b}
  .title-cell{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f1f5f9;font-weight:500}
  .preview-cell{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#94a3b8}
  .mono{font-family:'SF Mono',Monaco,monospace;font-size:11px;color:#64748b}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff}

  /* Drawer */
  .overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:50;opacity:0;pointer-events:none;transition:opacity 0.25s}
  .overlay.open{opacity:1;pointer-events:auto}
  .drawer{position:fixed;top:0;right:0;width:560px;max-width:90vw;height:100%;background:#1e293b;z-index:60;transform:translateX(100%);transition:transform 0.3s ease;display:flex;flex-direction:column;box-shadow:-4px 0 20px rgba(0,0,0,0.4)}
  .drawer.open{transform:translateX(0)}
  .drawer-header{padding:16px 20px;border-bottom:1px solid #334155;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0}
  .drawer-header h2{font-size:15px;font-weight:600;color:#f1f5f9;line-height:1.4}
  .drawer-close{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:22px;padding:0 4px;line-height:1}
  .drawer-close:hover{color:#f1f5f9}
  .drawer-meta{padding:12px 20px;border-bottom:1px solid #334155;display:flex;flex-wrap:wrap;gap:8px;flex-shrink:0}
  .meta-tag{font-size:11px;padding:3px 8px;border-radius:6px;background:#334155;color:#cbd5e1}
  .meta-tag b{color:#f1f5f9}
  .drawer-messages{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px}
  .msg{display:flex;flex-direction:column;gap:4px;max-width:90%}
  .msg.customer{align-self:flex-start}
  .msg.ai_agent{align-self:flex-end}
  .msg-label{font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px}
  .msg.ai_agent .msg-label{justify-content:flex-end}
  .msg-bubble{padding:10px 14px;border-radius:12px;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
  .msg.customer .msg-bubble{background:#334155;color:#e2e8f0;border-bottom-left-radius:4px}
  .msg.ai_agent .msg-bubble{background:#1d4ed8;color:#e2e8f0;border-bottom-right-radius:4px}
  .msg.other .msg-bubble{background:#4a1d6e;color:#e2e8f0;border-radius:8px;align-self:center}

  /* Scrollbar */
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
  ::-webkit-scrollbar-thumb:hover{background:#475569}

  /* Nav arrows in drawer */
  .drawer-nav{display:flex;gap:8px;padding:12px 20px;border-top:1px solid #334155;flex-shrink:0;justify-content:space-between;align-items:center}
  .drawer-nav button{background:#334155;border:none;color:#e2e8f0;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:background 0.15s}
  .drawer-nav button:hover{background:#475569}
  .drawer-nav button:disabled{opacity:0.3;cursor:not-allowed}
  .drawer-nav .nav-info{font-size:12px;color:#64748b}
</style>
</head>
<body>
  <div class="header">
    <h1>Assembled QA Review</h1>
    <div class="stats">
      <span>${results.length} cases</span>
      <span>${new Date().toLocaleDateString()}</span>
    </div>
  </div>
  <div class="container">
    <table>
      <thead>
        <tr>
          <th>#</th><th>Title</th><th>Case ID</th><th>AI Exp.</th><th>Resolution</th><th>Efficiency</th><th>Sentiment</th><th>Msgs</th><th>Preview</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <div class="overlay" id="overlay" onclick="closeDrawer()"></div>
  <div class="drawer" id="drawer">
    <div class="drawer-header">
      <h2 id="drawerTitle"></h2>
      <button class="drawer-close" onclick="closeDrawer()">&times;</button>
    </div>
    <div class="drawer-meta" id="drawerMeta"></div>
    <div class="drawer-messages" id="drawerMessages"></div>
    <div class="drawer-nav">
      <button id="prevBtn" onclick="navCase(-1)">&larr; Previous</button>
      <span class="nav-info" id="navInfo"></span>
      <button id="nextBtn" onclick="navCase(1)">Next &rarr;</button>
    </div>
  </div>

<script>
const cases = ${casesJSON};
let currentIndex = -1;

function openDrawer(idx) {
  currentIndex = idx;
  renderDrawer();
  document.getElementById('overlay').classList.add('open');
  document.getElementById('drawer').classList.add('open');
}

function closeDrawer() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('drawer').classList.remove('open');
  currentIndex = -1;
}

function navCase(dir) {
  const next = currentIndex + dir;
  if (next >= 0 && next < cases.length) {
    currentIndex = next;
    renderDrawer();
  }
}

function badgeColor(val) {
  const v = (val || '').toLowerCase();
  if (['poor','frustrated','degraded','dead end','not resolved'].includes(v)) return '#ef4444';
  if (['excellent','delighted','one-shot','fully resolved'].includes(v)) return '#22c55e';
  if (['good','neutral','direct'].includes(v)) return '#3b82f6';
  if (['looping','frictional'].includes(v)) return '#f59e0b';
  return '#6b7280';
}

function e(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function renderDrawer() {
  const c = cases[currentIndex];
  document.getElementById('drawerTitle').textContent = c.title || 'Untitled';

  const metaItems = [
    {label:'Case ID', value:c.case_id},
    {label:'Created', value:c.created_at},
    {label:'AI Exp.', value:c.aiExperience, color:true},
    {label:'Resolution', value:c.resolution, color:true},
    {label:'Efficiency', value:c.efficiency, color:true},
    {label:'Sentiment', value:c.sentiment, color:true},
    {label:'User', value:c.user_id},
    {label:'Agent', value:c.ai_agent},
  ].filter(m => m.value && m.value !== '—');

  document.getElementById('drawerMeta').innerHTML = metaItems.map(m =>
    m.color
      ? '<span class="meta-tag"><b>' + e(m.label) + ':</b> <span class="badge" style="background:' + badgeColor(m.value) + '">' + e(m.value) + '</span></span>'
      : '<span class="meta-tag"><b>' + e(m.label) + ':</b> ' + e(m.value) + '</span>'
  ).join('');

  const msgs = c.messages || [];
  document.getElementById('drawerMessages').innerHTML = msgs.map(m => {
    const role = m.role || 'other';
    const label = role === 'customer' ? 'Customer' : role === 'ai_agent' ? 'AI Agent' : 'System';
    const icon = role === 'customer' ? '&#128100;' : role === 'ai_agent' ? '&#129302;' : '&#9881;';
    return '<div class="msg ' + role + '">' +
      '<div class="msg-label">' + icon + ' <b>' + e(label) + '</b> &middot; ' + e(m.timestamp) + '</div>' +
      '<div class="msg-bubble">' + e(m.content) + '</div>' +
    '</div>';
  }).join('');

  document.getElementById('drawerMessages').scrollTop = 0;
  document.getElementById('prevBtn').disabled = currentIndex <= 0;
  document.getElementById('nextBtn').disabled = currentIndex >= cases.length - 1;
  document.getElementById('navInfo').textContent = (currentIndex + 1) + ' / ' + cases.length;

  // Highlight row
  document.querySelectorAll('.case-row').forEach(r => r.style.background = '');
  const row = document.querySelector('.case-row[data-index="' + currentIndex + '"]');
  if (row) row.style.background = '#1e293b';
}

document.addEventListener('keydown', (ev) => {
  if (currentIndex === -1) return;
  if (ev.key === 'Escape') closeDrawer();
  if (ev.key === 'ArrowLeft') navCase(-1);
  if (ev.key === 'ArrowRight') navCase(1);
});
</script>
</body>
</html>`;
}

// --- Events ---
pickToggle.addEventListener('click', () => {
  if (!currentTabId) return;
  const enable = !currentState?.pickMode;
  chrome.runtime.sendMessage({
    type: 'TOGGLE_PICK_MODE',
    tabId: currentTabId,
    enabled: enable,
  });
});

clearAllBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_SELECTIONS', tabId: currentTabId });
});

document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mode = radio.value;
    paginationConfig.classList.toggle('hidden', mode !== 'pagination');
    listConfig.classList.toggle('hidden', mode !== 'list');
    scrollConfig.classList.toggle('hidden', mode !== 'scroll');
    assembledConfig.classList.toggle('hidden', mode !== 'assembled');
    // Enable extract button for assembled mode even without selections
    const isAssembled = mode === 'assembled';
    extractBtn.disabled = (!isAssembled && !currentState?.selectedElements?.length) ||
      currentState?.status === 'extracting' || currentState?.status === 'iterating';
  });
});

markNextBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { type: 'SET_SPECIAL_MODE', mode: 'next-button' });
});

markListBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { type: 'SET_SPECIAL_MODE', mode: 'list-item' });
});

extractBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'single';

  chrome.runtime.sendMessage({ type: 'GET_STATE', tabId: currentTabId }, (res) => {
    if (!res?.state) return;
    const state = res.state;
    state.extractionMode = mode;
    state.iterationConfig.maxPages = parseInt(maxPagesInput.value) || 10;
    state.iterationConfig.maxScrolls = parseInt(maxScrollsInput.value) || 20;
    state.iterationConfig.scrollDelay = parseInt(scrollDelayInput.value) || 1500;

    if (mode === 'assembled') {
      state.iterationConfig.maxPages = parseInt(assembledMaxCasesInput.value) || 20;
      state.iterationConfig.assembledMaxPages = parseInt(assembledMaxPagesInput.value) || 1;
    }

    chrome.runtime.sendMessage({
      type: 'START_EXTRACTION',
      tabId: currentTabId,
      mode,
      iterationConfig: state.iterationConfig,
    });

    document.querySelector('.tab[data-tab="results"]').click();
  });
});

stopBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'STOP_ITERATION', tabId: currentTabId });
});

document.querySelectorAll('.export-btn').forEach(btn => {
  btn.addEventListener('click', () => exportResults(btn.dataset.format));
});

function exportResults(format) {
  const results = currentState?.results || [];
  if (results.length === 0) return;

  let content, filename, mimeType;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  switch (format) {
    case 'json': {
      // If Assembled data, export with full structure
      const isAssembled = results[0]?.messages;
      content = JSON.stringify({
        url: location.href,
        timestamp: new Date().toISOString(),
        count: results.length,
        data: isAssembled ? results : results.map(row => {
          const flat = {};
          Object.entries(row).forEach(([k, v]) => { flat[k] = v?.text || v; });
          return flat;
        }),
      }, null, 2);
      filename = `scrape-${ts}.json`;
      mimeType = 'application/json';
      break;
    }
    case 'csv': {
      if (results[0]?.messages) {
        // Assembled format: flatten cases
        const header = '"Case ID","Title","Created At","AI Experience","Resolution","Efficiency","Sentiment","Message Count","Conversation"';
        const rows = results.map(c => {
          const convo = (c.messages || []).map(m => `[${m.role}] ${m.content}`).join(' | ');
          return [c.case_id, c.title, c.created_at, c.aiExperience, c.resolution, c.efficiency, c.sentiment, c.messages?.length, convo]
            .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
            .join(',');
        });
        content = [header, ...rows].join('\n');
      } else {
        const labels = Object.keys(results[0] || {});
        const header = labels.map(l => `"${l.replace(/"/g, '""')}"`).join(',');
        const rows = results.map(row =>
          labels.map(l => `"${String(row[l]?.text || row[l] || '').replace(/"/g, '""')}"`).join(',')
        );
        content = [header, ...rows].join('\n');
      }
      filename = `scrape-${ts}.csv`;
      mimeType = 'text/csv';
      break;
    }
    case 'markdown': {
      const labels = Object.keys(results[0] || {});
      let md = `# Scrape Results\n\n- **Date**: ${new Date().toLocaleString()}\n- **Count**: ${results.length}\n\n`;
      md += '| ' + labels.join(' | ') + ' |\n';
      md += '| ' + labels.map(() => '---').join(' | ') + ' |\n';
      results.forEach(row => {
        md += '| ' + labels.map(l => String(row[l]?.text || row[l] || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ') + ' |\n';
      });
      content = md;
      filename = `scrape-${ts}.md`;
      mimeType = 'text/markdown';
      break;
    }
    case 'html': {
      if (results[0]?.messages) {
        content = buildAssembledHTML(results);
      } else {
        const labels = Object.keys(results[0] || {});
        let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scrape Results</title>
          <style>body{font-family:system-ui;margin:20px;color:#333}table{border-collapse:collapse;width:100%}
          th,td{border:1px solid #e5e5e5;padding:8px 12px;text-align:left;font-size:14px}th{background:#f9f9f9;font-weight:600}</style></head><body>
          <h1>Scrape Results</h1><p>${results.length} records</p><table><thead><tr>`;
        labels.forEach(l => { h += `<th>${l}</th>`; });
        h += '</tr></thead><tbody>';
        results.forEach(row => {
          h += '<tr>';
          labels.forEach(l => { h += `<td>${row[l]?.html || row[l]?.text || row[l] || ''}</td>`; });
          h += '</tr>';
        });
        h += '</tbody></table></body></html>';
        content = h;
      }
      filename = `scrape-${ts}.html`;
      mimeType = 'text/html';
      break;
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Save to Library ---
saveToLibrary.addEventListener('click', async () => {
  const results = currentState?.results || [];
  if (results.length === 0) return;

  const db = globalThis.__uniScraperDB;
  if (!db) return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await db.saveScrape({
    url: tab?.url || '',
    title: tab?.title || '',
    mode: currentState.extractionMode || 'single',
    selectors: currentState.selectedElements || [],
    data: results,
    count: results.length,
  });

  saveToLibrary.querySelector('svg').style.display = 'none';
  const prevText = saveToLibrary.textContent;
  saveToLibrary.innerHTML = `<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved!`;
  setTimeout(() => {
    saveToLibrary.innerHTML = `<svg class="btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save to Library`;
  }, 2000);
  loadLibrary();
});

// --- Library ---
async function loadLibrary() {
  const db = globalThis.__uniScraperDB;
  if (!db) return;

  const scrapes = await db.getAllScrapes();
  if (scrapes.length === 0) {
    libraryList.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      <span>No saved scrapes yet</span>
    </div>`;
    return;
  }

  libraryList.innerHTML = scrapes.reverse().map(s => `
    <div class="library-card">
      <div class="library-card-header">
        <div class="library-card-title">${esc(s.title || s.url || 'Untitled')}</div>
        <button class="library-card-delete" data-id="${s.id}" title="Delete">&times;</button>
      </div>
      <div class="library-card-url">${esc(s.url || '')}</div>
      <div class="library-card-meta">
        <span>${s.count || s.data?.length || 0} records</span>
        <span>${s.mode || 'single'}</span>
        <span>${new Date(s.timestamp).toLocaleDateString()}</span>
      </div>
      <div class="library-card-actions">
        <button class="lib-export-btn" data-id="${s.id}" data-format="json">JSON</button>
        <button class="lib-export-btn" data-id="${s.id}" data-format="csv">CSV</button>
        <button class="lib-export-btn" data-id="${s.id}" data-format="markdown">MD</button>
        <button class="lib-export-btn" data-id="${s.id}" data-format="html">HTML</button>
      </div>
    </div>
  `).join('');

  libraryList.querySelectorAll('.library-card-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.deleteScrape(parseInt(btn.dataset.id));
      loadLibrary();
    });
  });

  libraryList.querySelectorAll('.lib-export-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const scrape = await db.getScrape(parseInt(btn.dataset.id));
      if (scrape) {
        const prev = currentState?.results;
        currentState = currentState || {};
        currentState.results = scrape.data;
        exportResults(btn.dataset.format);
        currentState.results = prev;
      }
    });
  });
}

// --- State updates ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE' && msg.state) {
    currentState = { ...currentState, ...msg.state };
    if (msg.state.results) currentState.results = msg.state.results;
    render();
  }
  if (msg.type === 'ITERATION_PROGRESS') {
    progressText.textContent = `Page ${msg.page}/${msg.maxPages} \u2014 ${msg.resultCount} results`;
    const pct = Math.round((msg.page / msg.maxPages) * 100);
    progressBar.style.width = `${pct}%`;
  }
});

document.querySelector('.tab[data-tab="library"]').addEventListener('click', loadLibrary);

init();
