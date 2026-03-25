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

  // Get current state
  chrome.runtime.sendMessage(
    { type: 'GET_STATE', tabId: currentTabId },
    (response) => {
      if (response?.state) {
        updateUI(response.state);
      }
    }
  );
}

function updateUI(state) {
  isPicking = state.pickMode;
  countEl.textContent = state.selectedElements?.length || 0;

  if (isPicking) {
    pickBtn.textContent = 'Stop Picking';
    pickBtn.classList.add('active');
    statusEl.textContent = 'Picking elements...';
    statusEl.classList.add('active');
  } else {
    pickBtn.textContent = 'Start Picking';
    pickBtn.classList.remove('active');
    statusEl.textContent = state.status === 'idle' ? 'Ready' : state.status;
    statusEl.classList.remove('active');
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
  // Also open side panel directly
  chrome.sidePanel.open({ tabId: currentTabId }).catch(() => {});
});

// Listen for state updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'STATE_UPDATE' && msg.state) {
    updateUI(msg.state);
  }
});

init();
