const pickBtn = document.getElementById('pickBtn');
const panelBtn = document.getElementById('panelBtn');
const statusEl = document.getElementById('status');
const countEl = document.getElementById('selectedCount');

let currentTabId = null;
let isPicking = false;

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;

  chrome.runtime.sendMessage(
    { type: 'GET_STATE', tabId: currentTabId },
    (response) => {
      if (response?.state) updateUI(response.state);
    }
  );
}

function updateUI(state) {
  isPicking = state.pickMode;
  countEl.textContent = state.selectedElements?.length || 0;

  if (isPicking) {
    pickBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> Stop Picking`;
    pickBtn.classList.add('picking');
    statusEl.textContent = 'Picking';
    statusEl.classList.add('picking');
  } else {
    pickBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg> Start Picking`;
    pickBtn.classList.remove('picking');
    statusEl.textContent = state.status === 'idle' ? 'Ready' : state.status;
    statusEl.classList.remove('picking');
  }
}

pickBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  const enable = !isPicking;
  chrome.runtime.sendMessage(
    { type: 'TOGGLE_PICK_MODE', tabId: currentTabId, enabled: enable },
    (response) => {
      if (response?.ok) {
        isPicking = enable;
        updateUI({
          pickMode: enable,
          selectedElements: [],
          status: enable ? 'picking' : 'idle',
        });
      }
    }
  );
});

panelBtn.addEventListener('click', () => {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', tabId: currentTabId });
  chrome.sidePanel.open({ tabId: currentTabId }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE' && msg.state) updateUI(msg.state);
});

init();
