// Central orchestrator - state management and message routing

const MSG = {
  TOGGLE_PICK_MODE: 'TOGGLE_PICK_MODE',
  ELEMENT_SELECTED: 'ELEMENT_SELECTED',
  ELEMENT_DESELECTED: 'ELEMENT_DESELECTED',
  START_EXTRACTION: 'START_EXTRACTION',
  EXTRACTION_RESULT: 'EXTRACTION_RESULT',
  ITERATE_PAGINATION: 'ITERATE_PAGINATION',
  ITERATE_LIST: 'ITERATE_LIST',
  ITERATE_SCROLL: 'ITERATE_SCROLL',
  PAGE_READY: 'PAGE_READY',
  ITERATION_COMPLETE: 'ITERATION_COMPLETE',
  ITERATION_PROGRESS: 'ITERATION_PROGRESS',
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
  STATE_UPDATE: 'STATE_UPDATE',
  GET_STATE: 'GET_STATE',
  MARK_NEXT_BUTTON: 'MARK_NEXT_BUTTON',
  MARK_LIST_ITEMS: 'MARK_LIST_ITEMS',
  SAVE_SCRAPE: 'SAVE_SCRAPE',
  EXPORT_DATA: 'EXPORT_DATA',
  CLEAR_SELECTIONS: 'CLEAR_SELECTIONS',
  REMOVE_SELECTION: 'REMOVE_SELECTION',
  STOP_ITERATION: 'STOP_ITERATION',
};

const MODES = {
  SINGLE: 'single',
  PAGINATION: 'pagination',
  LIST: 'list',
  SCROLL: 'scroll',
  ASSEMBLED: 'assembled',
};

const STATUS = {
  IDLE: 'idle',
  PICKING: 'picking',
  EXTRACTING: 'extracting',
  ITERATING: 'iterating',
};

// Per-tab state
const tabStates = new Map();

function getTabState(tabId) {
  if (!tabStates.has(tabId)) {
    tabStates.set(tabId, {
      tabId,
      pickMode: false,
      selectedElements: [],
      extractionMode: MODES.SINGLE,
      iterationConfig: {
        nextButtonSelector: null,
        listItemSelector: null,
        maxPages: 10,
        scrollDelay: 1500,
        maxScrolls: 20,
      },
      results: [],
      status: STATUS.IDLE,
      stopRequested: false,
    });
  }
  return tabStates.get(tabId);
}

function broadcastState(tabId) {
  const state = getTabState(tabId);
  // Send to side panel and popup
  chrome.runtime.sendMessage({
    type: MSG.STATE_UPDATE,
    state: {
      ...state,
      // Don't send huge results in every update
      resultCount: state.results.length,
    },
  }).catch(() => {
    // Side panel or popup might not be open
  });
}

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (msg.type) {
    case MSG.TOGGLE_PICK_MODE: {
      const tid = msg.tabId || tabId;
      if (!tid) { sendResponse({ ok: false }); return; }
      const state = getTabState(tid);
      const enabled = msg.enabled !== undefined ? msg.enabled : !state.pickMode;
      state.pickMode = enabled;
      state.status = enabled ? STATUS.PICKING : STATUS.IDLE;
      // Forward to content script
      chrome.tabs.sendMessage(tid, { type: MSG.TOGGLE_PICK_MODE, enabled }).catch(() => {});
      broadcastState(tid);
      sendResponse({ ok: true, pickMode: enabled });
      break;
    }

    case MSG.ELEMENT_SELECTED: {
      if (!tabId) return;
      const state = getTabState(tabId);
      // Avoid duplicates
      if (!state.selectedElements.find(e => e.selector === msg.selector)) {
        state.selectedElements.push({
          selector: msg.selector,
          preview: msg.preview,
          tagName: msg.tagName,
          html: msg.html,
          label: `Element ${state.selectedElements.length + 1}`,
        });
      }
      broadcastState(tabId);
      sendResponse({ ok: true });
      break;
    }

    case MSG.ELEMENT_DESELECTED: {
      if (!tabId) return;
      const state = getTabState(tabId);
      state.selectedElements = state.selectedElements.filter(
        e => e.selector !== msg.selector
      );
      broadcastState(tabId);
      sendResponse({ ok: true });
      break;
    }

    case MSG.MARK_NEXT_BUTTON: {
      if (!tabId) return;
      const state = getTabState(tabId);
      state.iterationConfig.nextButtonSelector = msg.selector;
      broadcastState(tabId);
      sendResponse({ ok: true });
      break;
    }

    case MSG.MARK_LIST_ITEMS: {
      if (!tabId) return;
      const state = getTabState(tabId);
      state.iterationConfig.listItemSelector = msg.selector;
      broadcastState(tabId);
      sendResponse({ ok: true });
      break;
    }

    case MSG.GET_STATE: {
      const tid = msg.tabId;
      if (!tid) { sendResponse({ state: null }); return; }
      const state = getTabState(tid);
      sendResponse({ state });
      break;
    }

    case MSG.CLEAR_SELECTIONS: {
      const tid = msg.tabId || tabId;
      if (!tid) return;
      const state = getTabState(tid);
      state.selectedElements = [];
      state.iterationConfig.nextButtonSelector = null;
      state.iterationConfig.listItemSelector = null;
      state.results = [];
      chrome.tabs.sendMessage(tid, { type: MSG.CLEAR_SELECTIONS }).catch(() => {});
      broadcastState(tid);
      sendResponse({ ok: true });
      break;
    }

    case MSG.REMOVE_SELECTION: {
      const tid = msg.tabId || tabId;
      if (!tid) return;
      const state = getTabState(tid);
      state.selectedElements = state.selectedElements.filter(
        e => e.selector !== msg.selector
      );
      chrome.tabs.sendMessage(tid, { type: MSG.REMOVE_SELECTION, selector: msg.selector }).catch(() => {});
      broadcastState(tid);
      sendResponse({ ok: true });
      break;
    }

    case MSG.START_EXTRACTION: {
      const tid = msg.tabId;
      if (!tid) return;
      const state = getTabState(tid);
      // Apply mode and config from side panel
      if (msg.mode) state.extractionMode = msg.mode;
      if (msg.iterationConfig) {
        Object.assign(state.iterationConfig, msg.iterationConfig);
      }
      handleExtraction(tid, state);
      sendResponse({ ok: true });
      break;
    }

    case MSG.SAVE_SCRAPE: {
      const tid = msg.tabId;
      if (!tid) return;
      const state = getTabState(tid);
      // Save to IndexedDB via side panel (it has access to db.js)
      chrome.runtime.sendMessage({
        type: 'SCRAPE_SAVED',
        data: {
          url: msg.url || '',
          title: msg.title || '',
          mode: state.extractionMode,
          selectors: state.selectedElements,
          results: state.results,
        },
      }).catch(() => {});
      sendResponse({ ok: true });
      break;
    }

    case MSG.OPEN_SIDE_PANEL: {
      if (msg.tabId) {
        chrome.sidePanel.open({ tabId: msg.tabId }).catch(() => {});
      }
      sendResponse({ ok: true });
      break;
    }

    case MSG.STOP_ITERATION: {
      const tid = msg.tabId;
      if (!tid) return;
      const state = getTabState(tid);
      state.stopRequested = true;
      sendResponse({ ok: true });
      break;
    }

    case MSG.EXTRACTION_RESULT: {
      // Results coming back from content script
      if (!tabId) return;
      const state = getTabState(tabId);
      if (msg.data) {
        state.results.push(...(Array.isArray(msg.data) ? msg.data : [msg.data]));
      }
      broadcastState(tabId);
      sendResponse({ ok: true });
      break;
    }

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
  }

  return true; // Keep message channel open for async responses
});

async function handleExtraction(tabId, state) {
  state.status = STATUS.EXTRACTING;
  state.results = [];
  state.stopRequested = false;
  broadcastState(tabId);

  const selectors = state.selectedElements.map(e => ({
    selector: e.selector,
    label: e.label,
  }));

  if (state.extractionMode === MODES.SINGLE) {
    // Inject extraction engine and run
    await injectAndExtract(tabId, selectors);
    state.status = STATUS.IDLE;
    broadcastState(tabId);
  } else if (state.extractionMode === MODES.PAGINATION) {
    await handlePagination(tabId, state, selectors);
  } else if (state.extractionMode === MODES.SCROLL) {
    await handleScroll(tabId, state, selectors);
  } else if (state.extractionMode === MODES.LIST) {
    await handleListIteration(tabId, state, selectors);
  } else if (state.extractionMode === MODES.ASSEMBLED) {
    await handleAssembledIteration(tabId, state);
  }
}

async function injectAndExtract(tabId, selectors) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractFromPage,
      args: [selectors],
    });
    if (results && results[0] && results[0].result) {
      const state = getTabState(tabId);
      state.results.push(...results[0].result);
    }
  } catch (e) {
    console.error('Extraction failed:', e);
  }
}

// This function runs in the content script context
function extractFromPage(selectors) {
  const rows = [];

  // Find the max number of matches across all selectors
  let maxMatches = 0;
  const allMatches = selectors.map(({ selector, label }) => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > maxMatches) maxMatches = elements.length;
    return { label, elements: Array.from(elements) };
  });

  // If all selectors match exactly 1 element, it's a single row
  if (maxMatches <= 1) {
    const row = {};
    allMatches.forEach(({ label, elements }) => {
      const el = elements[0];
      if (el) {
        row[label] = {
          text: (el.textContent || '').trim(),
          html: el.outerHTML,
          tag: el.tagName.toLowerCase(),
          href: el.href || el.querySelector('a')?.href || null,
          src: el.src || el.querySelector('img')?.src || null,
          attributes: Object.fromEntries(
            Array.from(el.attributes).map(a => [a.name, a.value])
          ),
        };
      }
    });
    rows.push(row);
  } else {
    // Multiple matches - build rows by index
    for (let i = 0; i < maxMatches; i++) {
      const row = {};
      allMatches.forEach(({ label, elements }) => {
        const el = elements[i];
        if (el) {
          row[label] = {
            text: (el.textContent || '').trim(),
            html: el.outerHTML,
            tag: el.tagName.toLowerCase(),
            href: el.href || el.querySelector('a')?.href || null,
            src: el.src || el.querySelector('img')?.src || null,
            attributes: Object.fromEntries(
              Array.from(el.attributes).map(a => [a.name, a.value])
            ),
          };
        }
      });
      rows.push(row);
    }
  }

  return rows;
}

async function handlePagination(tabId, state, selectors) {
  state.status = STATUS.ITERATING;
  broadcastState(tabId);

  const nextSelector = state.iterationConfig.nextButtonSelector;
  const maxPages = state.iterationConfig.maxPages;

  for (let page = 0; page < maxPages; page++) {
    if (state.stopRequested) break;

    // Extract current page
    await injectAndExtract(tabId, selectors);

    // Notify progress
    chrome.runtime.sendMessage({
      type: MSG.ITERATION_PROGRESS,
      page: page + 1,
      maxPages,
      resultCount: state.results.length,
    }).catch(() => {});

    if (page < maxPages - 1 && nextSelector) {
      // Click next button
      const clicked = await chrome.scripting.executeScript({
        target: { tabId },
        func: (sel) => {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
          return false;
        },
        args: [nextSelector],
      });

      if (!clicked[0]?.result) break;

      // Wait for page to settle
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  state.status = STATUS.IDLE;
  broadcastState(tabId);
}

async function handleScroll(tabId, state, selectors) {
  state.status = STATUS.ITERATING;
  broadcastState(tabId);

  const maxScrolls = state.iterationConfig.maxScrolls;
  const delay = state.iterationConfig.scrollDelay;
  let prevCount = 0;

  for (let scroll = 0; scroll < maxScrolls; scroll++) {
    if (state.stopRequested) break;

    // Extract current content
    await injectAndExtract(tabId, selectors);

    // Notify progress
    chrome.runtime.sendMessage({
      type: MSG.ITERATION_PROGRESS,
      page: scroll + 1,
      maxPages: maxScrolls,
      resultCount: state.results.length,
    }).catch(() => {});

    // Check if we got new results
    if (state.results.length === prevCount && scroll > 0) break;
    prevCount = state.results.length;

    // Scroll down
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.scrollTo(0, document.body.scrollHeight),
    });

    await new Promise(r => setTimeout(r, delay));
  }

  state.status = STATUS.IDLE;
  broadcastState(tabId);
}

async function handleListIteration(tabId, state, selectors) {
  state.status = STATUS.ITERATING;
  broadcastState(tabId);

  const listSelector = state.iterationConfig.listItemSelector;
  if (!listSelector) {
    state.status = STATUS.IDLE;
    broadcastState(tabId);
    return;
  }

  // Get count of list items
  const countResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel) => document.querySelectorAll(sel).length,
    args: [listSelector],
  });

  const itemCount = countResult[0]?.result || 0;

  for (let i = 0; i < itemCount; i++) {
    if (state.stopRequested) break;

    // Click item i
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, index) => {
        const items = document.querySelectorAll(sel);
        if (items[index]) items[index].click();
      },
      args: [listSelector, i],
    });

    await new Promise(r => setTimeout(r, 1500));

    // Extract from detail page
    await injectAndExtract(tabId, selectors);

    chrome.runtime.sendMessage({
      type: MSG.ITERATION_PROGRESS,
      page: i + 1,
      maxPages: itemCount,
      resultCount: state.results.length,
    }).catch(() => {});

    // Go back
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => history.back(),
    });

    await new Promise(r => setTimeout(r, 1500));
  }

  state.status = STATUS.IDLE;
  broadcastState(tabId);
}

async function handleAssembledIteration(tabId, state) {
  state.status = STATUS.ITERATING;
  broadcastState(tabId);

  const maxCases = state.iterationConfig.maxPages || 20;
  const maxPages = state.iterationConfig.assembledMaxPages || 1;
  let totalExtracted = 0;

  for (let page = 0; page < maxPages; page++) {
    if (state.stopRequested) break;

    // Get count of cases on this page
    const countResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__uniScraper_assembled?.getCaseList()?.length || 0,
    });
    const caseCount = countResult[0]?.result || 0;
    if (caseCount === 0) break;

    const casesToProcess = Math.min(caseCount, maxCases - totalExtracted);

    // Open the first case
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (idx) => window.__uniScraper_assembled?.openCase(idx),
      args: [0],
    });
    await new Promise(r => setTimeout(r, 1500));

    // Iterate through cases using Next button
    for (let i = 0; i < casesToProcess; i++) {
      if (state.stopRequested) break;

      // Scroll messages to bottom first to ensure all are loaded
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__uniScraper_assembled?.scrollMessagesToBottom(),
      });
      await new Promise(r => setTimeout(r, 500));

      // Extract full case data
      const extractResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__uniScraper_assembled?.extractFullCase(),
      });

      const caseData = extractResult[0]?.result;
      if (caseData) {
        state.results.push(caseData);
        totalExtracted++;
      }

      // Report progress
      chrome.runtime.sendMessage({
        type: MSG.ITERATION_PROGRESS,
        page: totalExtracted,
        maxPages: maxCases,
        resultCount: state.results.length,
      }).catch(() => {});

      broadcastState(tabId);

      // Click Next to go to the next case (unless last)
      if (i < casesToProcess - 1) {
        const nextResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.__uniScraper_assembled?.clickNext(),
        });
        if (!nextResult[0]?.result) break;
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Close dialog before going to next page
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__uniScraper_assembled?.closeDialog(),
    });
    await new Promise(r => setTimeout(r, 500));

    // Go to next table page if needed
    if (page < maxPages - 1 && totalExtracted < maxCases) {
      const nextPageResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__uniScraper_assembled?.goToNextPage(),
      });
      if (!nextPageResult[0]?.result) break;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  state.status = STATUS.IDLE;
  broadcastState(tabId);
}

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// Inject site-specific adapters when navigating
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    if (tab.url?.includes('app.slack.com')) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/slack-adapter.js'],
      }).catch(() => {});
    }
    if (tab.url?.includes('app.assembledhq.com')) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/assembled-adapter.js'],
      }).catch(() => {});
    }
  }
});

// Open side panel when extension icon is clicked (as secondary action)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
