// Visual element picker - hover highlight and click selection
(function () {
  'use strict';

  let pickMode = false;
  let specialMode = null; // null | 'next-button' | 'list-item'
  let overlay = null;

  function createOverlay(text) {
    removeOverlay();
    overlay = document.createElement('div');
    overlay.className = '__uni-scraper-overlay';
    overlay.textContent = text;
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
  }

  function updateOverlayText() {
    if (!overlay) return;
    if (specialMode === 'next-button') {
      overlay.textContent = 'Click the "Next" button for pagination';
      overlay.style.background = 'rgba(245, 158, 11, 0.9)';
    } else if (specialMode === 'list-item') {
      overlay.textContent = 'Click a list item to mark the pattern';
      overlay.style.background = 'rgba(59, 130, 246, 0.9)';
    } else {
      overlay.textContent = 'Pick mode — click elements to select for scraping';
      overlay.style.background = 'rgba(220, 38, 38, 0.9)';
    }
  }

  function onMouseOver(e) {
    if (!pickMode) return;
    const el = e.target;
    if (el.classList.contains('__uni-scraper-overlay')) return;
    el.classList.add('__uni-scraper-hover');
  }

  function onMouseOut(e) {
    if (!pickMode) return;
    e.target.classList.remove('__uni-scraper-hover');
  }

  function onClick(e) {
    if (!pickMode) return;
    const el = e.target;
    if (el.classList.contains('__uni-scraper-overlay')) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    el.classList.remove('__uni-scraper-hover');

    const selector = window.__uniScraper_getSelector(el);
    const preview = (el.textContent || '').trim().slice(0, 120);
    const tagName = el.tagName.toLowerCase();
    const html = el.outerHTML.slice(0, 500);

    if (specialMode === 'next-button') {
      // Mark as next button
      document.querySelectorAll('.__uni-scraper-next-btn').forEach(
        e => e.classList.remove('__uni-scraper-next-btn')
      );
      el.classList.add('__uni-scraper-next-btn');
      chrome.runtime.sendMessage({
        type: MSG.MARK_NEXT_BUTTON,
        selector,
        preview,
      });
      specialMode = null;
      updateOverlayText();
      return;
    }

    if (specialMode === 'list-item') {
      el.classList.add('__uni-scraper-list-item');
      chrome.runtime.sendMessage({
        type: MSG.MARK_LIST_ITEMS,
        selector,
        preview,
      });
      specialMode = null;
      updateOverlayText();
      return;
    }

    // Normal selection toggle
    const isSelected = el.classList.contains('__uni-scraper-selected');

    if (isSelected) {
      el.classList.remove('__uni-scraper-selected');
      chrome.runtime.sendMessage({
        type: MSG.ELEMENT_DESELECTED,
        selector,
      });
    } else {
      el.classList.add('__uni-scraper-selected');
      chrome.runtime.sendMessage({
        type: MSG.ELEMENT_SELECTED,
        selector,
        preview,
        tagName,
        html,
      });
    }
  }

  function enablePickMode() {
    pickMode = true;
    specialMode = null;
    createOverlay('Pick mode — click elements to select for scraping');
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onClick, true);
  }

  function disablePickMode() {
    pickMode = false;
    specialMode = null;
    removeOverlay();
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    // Clean up hover highlights but keep selections
    document.querySelectorAll('.__uni-scraper-hover').forEach(
      el => el.classList.remove('__uni-scraper-hover')
    );
  }

  function clearAllSelections() {
    document.querySelectorAll('.__uni-scraper-selected').forEach(
      el => el.classList.remove('__uni-scraper-selected')
    );
    document.querySelectorAll('.__uni-scraper-next-btn').forEach(
      el => el.classList.remove('__uni-scraper-next-btn')
    );
    document.querySelectorAll('.__uni-scraper-list-item').forEach(
      el => el.classList.remove('__uni-scraper-list-item')
    );
  }

  function removeSelection(selector) {
    const el = window.__uniScraper_getElementBySelector(selector);
    if (el) {
      el.classList.remove('__uni-scraper-selected');
    }
  }

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case MSG.TOGGLE_PICK_MODE:
        if (msg.enabled) {
          enablePickMode();
        } else {
          disablePickMode();
        }
        sendResponse({ ok: true });
        break;

      case 'SET_SPECIAL_MODE':
        specialMode = msg.mode; // 'next-button' | 'list-item' | null
        updateOverlayText();
        sendResponse({ ok: true });
        break;

      case MSG.CLEAR_SELECTIONS:
        clearAllSelections();
        sendResponse({ ok: true });
        break;

      case MSG.REMOVE_SELECTION:
        removeSelection(msg.selector);
        sendResponse({ ok: true });
        break;
    }
    return true;
  });
})();
