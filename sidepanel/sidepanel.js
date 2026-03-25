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

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
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

// Track active tab changes
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
    idle: { text: 'Idle', cls: 'bg-surface-2 text-neutral-500' },
    picking: { text: 'Picking', cls: 'bg-red-500/20 text-red-400' },
    extracting: { text: 'Extracting', cls: 'bg-emerald-500/20 text-emerald-400' },
    iterating: { text: 'Iterating', cls: 'bg-amber-500/20 text-amber-400' },
  };
  const s = statusMap[currentState.status] || statusMap.idle;
  statusBadge.className = `px-2 py-0.5 rounded text-xs ${s.cls}`;
  statusBadge.textContent = s.text;

  // Pick button
  if (currentState.pickMode) {
    pickToggle.textContent = 'Stop Picking';
    pickToggle.className = 'w-full py-2.5 rounded-lg bg-surface-1 text-accent border border-accent font-medium hover:bg-surface-2 transition';
  } else {
    pickToggle.textContent = 'Start Picking';
    pickToggle.className = 'w-full py-2.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover transition';
  }

  // Element list
  renderElementList();

  // Extract button
  extractBtn.disabled = !currentState.selectedElements?.length ||
    currentState.status === 'extracting' || currentState.status === 'iterating';

  // Progress
  if (currentState.status === 'extracting' || currentState.status === 'iterating') {
    progressSection.classList.remove('hidden');
  } else {
    progressSection.classList.add('hidden');
  }

  // Mode configs
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'single';
  paginationConfig.classList.toggle('hidden', mode !== 'pagination');
  listConfig.classList.toggle('hidden', mode !== 'list');
  scrollConfig.classList.toggle('hidden', mode !== 'scroll');

  // Iteration config status
  if (currentState.iterationConfig?.nextButtonSelector) {
    nextBtnStatus.textContent = `Next button: ${currentState.iterationConfig.nextButtonSelector}`;
  }
  if (currentState.iterationConfig?.listItemSelector) {
    listItemStatus.textContent = `List items: ${currentState.iterationConfig.listItemSelector}`;
  }

  // Results count
  const count = currentState.resultCount || currentState.results?.length || 0;
  resultCount.textContent = `(${count})`;

  // Render results table
  renderResults();
}

function renderElementList() {
  const els = currentState?.selectedElements || [];
  if (els.length === 0) {
    elementList.innerHTML = '<div class="text-neutral-600 text-xs py-6 text-center">No elements selected yet</div>';
    return;
  }

  elementList.innerHTML = els.map((el, i) => `
    <div class="flex items-start gap-2 p-2 rounded-lg bg-surface-1 border border-neutral-800 group">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-500 font-mono">${el.tagName || 'el'}</span>
          <input class="label-input text-xs bg-transparent text-neutral-200 border-none outline-none flex-1 min-w-0"
                 value="${escapeHtml(el.label)}" data-index="${i}" data-selector="${escapeHtml(el.selector)}">
        </div>
        <div class="text-[10px] text-neutral-600 mt-1 truncate font-mono">${escapeHtml(el.selector)}</div>
        <div class="text-[10px] text-neutral-500 mt-0.5 truncate">${escapeHtml(el.preview || '')}</div>
      </div>
      <button class="remove-el text-neutral-600 hover:text-accent text-xs opacity-0 group-hover:opacity-100 transition" data-selector="${escapeHtml(el.selector)}">
        &times;
      </button>
    </div>
  `).join('');

  // Remove buttons
  elementList.querySelectorAll('.remove-el').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'REMOVE_SELECTION',
        tabId: currentTabId,
        selector: btn.dataset.selector,
      });
    });
  });

  // Label editing
  elementList.querySelectorAll('.label-input').forEach(input => {
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
    resultsTable.innerHTML = '<div class="text-neutral-600 text-xs py-6 text-center">No results yet. Select elements and run extraction.</div>';
    return;
  }

  // Build table from results
  const labels = Object.keys(results[0] || {});
  if (labels.length === 0) return;

  let html = '<table class="w-full text-xs border-collapse">';
  html += '<thead><tr>';
  labels.forEach(l => {
    html += `<th class="text-left px-2 py-1.5 border-b border-neutral-700 text-neutral-400 font-medium">${escapeHtml(l)}</th>`;
  });
  html += '</tr></thead><tbody>';

  results.forEach((row, i) => {
    html += `<tr class="${i % 2 === 0 ? 'bg-surface-1' : ''}">`;
    labels.forEach(l => {
      const val = row[l];
      const text = val?.text || val || '';
      html += `<td class="px-2 py-1.5 border-b border-neutral-800 text-neutral-300 max-w-[200px] truncate">${escapeHtml(String(text))}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  resultsTable.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
  chrome.runtime.sendMessage({
    type: 'CLEAR_SELECTIONS',
    tabId: currentTabId,
  });
});

// Mode change
document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mode = radio.value;
    paginationConfig.classList.toggle('hidden', mode !== 'pagination');
    listConfig.classList.toggle('hidden', mode !== 'list');
    scrollConfig.classList.toggle('hidden', mode !== 'scroll');
  });
});

// Mark next button
markNextBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { type: 'SET_SPECIAL_MODE', mode: 'next-button' });
});

// Mark list items
markListBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { type: 'SET_SPECIAL_MODE', mode: 'list-item' });
});

// Extract
extractBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'single';

  // Update iteration config from inputs
  chrome.runtime.sendMessage({
    type: 'GET_STATE',
    tabId: currentTabId,
  }, (res) => {
    if (!res?.state) return;
    const state = res.state;
    state.extractionMode = mode;
    state.iterationConfig.maxPages = parseInt(maxPagesInput.value) || 10;
    state.iterationConfig.maxScrolls = parseInt(maxScrollsInput.value) || 20;
    state.iterationConfig.scrollDelay = parseInt(scrollDelayInput.value) || 1500;

    chrome.runtime.sendMessage({
      type: 'START_EXTRACTION',
      tabId: currentTabId,
      mode,
      iterationConfig: state.iterationConfig,
    });

    // Switch to results tab
    document.querySelector('.tab-btn[data-tab="results"]').click();
  });
});

// Stop
stopBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'STOP_ITERATION', tabId: currentTabId });
});

// Export buttons
document.querySelectorAll('.export-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const format = btn.dataset.format;
    exportResults(format);
  });
});

function exportResults(format) {
  const results = currentState?.results || [];
  if (results.length === 0) return;

  let content, filename, mimeType;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  switch (format) {
    case 'json': {
      content = JSON.stringify({
        url: location.href,
        timestamp: new Date().toISOString(),
        count: results.length,
        data: results.map(row => {
          const flat = {};
          Object.entries(row).forEach(([k, v]) => {
            flat[k] = v?.text || v;
          });
          return flat;
        }),
      }, null, 2);
      filename = `scrape-${timestamp}.json`;
      mimeType = 'application/json';
      break;
    }
    case 'csv': {
      const labels = Object.keys(results[0] || {});
      const header = labels.map(l => `"${l.replace(/"/g, '""')}"`).join(',');
      const rows = results.map(row =>
        labels.map(l => {
          const val = String(row[l]?.text || row[l] || '').replace(/"/g, '""');
          return `"${val}"`;
        }).join(',')
      );
      content = [header, ...rows].join('\n');
      filename = `scrape-${timestamp}.csv`;
      mimeType = 'text/csv';
      break;
    }
    case 'markdown': {
      const labels = Object.keys(results[0] || {});
      let md = `# Scrape Results\n\n`;
      md += `- **Date**: ${new Date().toLocaleString()}\n`;
      md += `- **Count**: ${results.length}\n\n`;
      md += '| ' + labels.join(' | ') + ' |\n';
      md += '| ' + labels.map(() => '---').join(' | ') + ' |\n';
      results.forEach(row => {
        md += '| ' + labels.map(l => {
          const val = String(row[l]?.text || row[l] || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
          return val;
        }).join(' | ') + ' |\n';
      });
      content = md;
      filename = `scrape-${timestamp}.md`;
      mimeType = 'text/markdown';
      break;
    }
    case 'html': {
      const labels = Object.keys(results[0] || {});
      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scrape Results</title>
        <style>body{font-family:system-ui;margin:20px}table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body>
        <h1>Scrape Results</h1><p>${results.length} records</p><table><thead><tr>`;
      labels.forEach(l => { html += `<th>${l}</th>`; });
      html += '</tr></thead><tbody>';
      results.forEach(row => {
        html += '<tr>';
        labels.forEach(l => {
          const val = row[l]?.html || row[l]?.text || row[l] || '';
          html += `<td>${val}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table></body></html>';
      content = html;
      filename = `scrape-${timestamp}.html`;
      mimeType = 'text/html';
      break;
    }
  }

  // Download
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Save to library
const saveToLibrary = document.getElementById('saveToLibrary');
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

  saveToLibrary.textContent = 'Saved!';
  setTimeout(() => { saveToLibrary.textContent = 'Save to Library'; }, 2000);
  loadLibrary();
});

// Library
const libraryList = document.getElementById('libraryList');

async function loadLibrary() {
  const db = globalThis.__uniScraperDB;
  if (!db) return;

  const scrapes = await db.getAllScrapes();
  if (scrapes.length === 0) {
    libraryList.innerHTML = '<div class="text-neutral-600 text-xs py-6 text-center">No saved scrapes yet.</div>';
    return;
  }

  libraryList.innerHTML = scrapes.reverse().map(s => `
    <div class="p-3 rounded-lg bg-surface-1 border border-neutral-800 space-y-1">
      <div class="flex items-center justify-between">
        <div class="text-xs font-medium text-neutral-200 truncate max-w-[200px]">${escapeHtml(s.title || s.url || 'Untitled')}</div>
        <button class="delete-scrape text-neutral-600 hover:text-accent text-xs" data-id="${s.id}">&times;</button>
      </div>
      <div class="text-[10px] text-neutral-500 truncate">${escapeHtml(s.url || '')}</div>
      <div class="flex items-center gap-2 text-[10px] text-neutral-600">
        <span>${s.count || s.data?.length || 0} records</span>
        <span>${s.mode || 'single'}</span>
        <span>${new Date(s.timestamp).toLocaleDateString()}</span>
      </div>
      <div class="flex gap-1 mt-1">
        <button class="lib-export text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-500 hover:text-neutral-300" data-id="${s.id}" data-format="json">JSON</button>
        <button class="lib-export text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-500 hover:text-neutral-300" data-id="${s.id}" data-format="csv">CSV</button>
        <button class="lib-export text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-500 hover:text-neutral-300" data-id="${s.id}" data-format="markdown">MD</button>
        <button class="lib-export text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-neutral-500 hover:text-neutral-300" data-id="${s.id}" data-format="html">HTML</button>
      </div>
    </div>
  `).join('');

  // Delete handlers
  libraryList.querySelectorAll('.delete-scrape').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.deleteScrape(parseInt(btn.dataset.id));
      loadLibrary();
    });
  });

  // Export from library
  libraryList.querySelectorAll('.lib-export').forEach(btn => {
    btn.addEventListener('click', async () => {
      const scrape = await db.getScrape(parseInt(btn.dataset.id));
      if (scrape) {
        const prevResults = currentState?.results;
        currentState = currentState || {};
        currentState.results = scrape.data;
        exportResults(btn.dataset.format);
        currentState.results = prevResults;
      }
    });
  });
}

// --- Listen for state updates ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE' && msg.state) {
    currentState = { ...currentState, ...msg.state };
    // Merge full results if available
    if (msg.state.results) {
      currentState.results = msg.state.results;
    }
    render();

    // Show/hide save button
    const hasResults = (currentState.results?.length || 0) > 0;
    saveToLibrary.classList.toggle('hidden', !hasResults);
  }
  if (msg.type === 'ITERATION_PROGRESS') {
    progressText.textContent = `Page ${msg.page}/${msg.maxPages} — ${msg.resultCount} results`;
    const pct = Math.round((msg.page / msg.maxPages) * 100);
    progressBar.style.width = `${pct}%`;
  }
});

// Load library on tab switch
document.querySelector('.tab-btn[data-tab="library"]').addEventListener('click', loadLibrary);

init();
