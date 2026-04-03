// Assembled QA Review adapter for app.assembledhq.com
(function () {
  'use strict';

  const ASSEMBLED_SELECTORS = {
    // Table of cases
    caseTable: 'table',
    caseRows: 'table tr',
    caseButton: 'td:first-child button:first-of-type', // The case title button in each row
    // Dialog (case detail)
    dialog: '[role="dialog"]',
    dialogClose: 'button:has(> span)', // Close button with "close" text
    navPrevious: 'button', // filtered by text "Previous"
    navNext: 'button', // filtered by text "Next"
    // Messages inside dialog
    messagesContainer: '[class*="_messagesContainer_"]',
    messageCard: '[class*="_messageCard_"]',
    senderTitle: 'p[class*="_title_"]',
    timestamp: 'p[class*="_timestamp_"]',
    messageText: 'p[class*="_messageText_"]',
    // Workflow cards (automated actions between messages)
    workflowCard: '[class*="_activitiesContainer_"]',
    // Sidebar metadata
    caseDetailsSection: '[class*="_bodyContainer_"]',
    // Pagination
    nextPageBtn: 'button[type="button"]', // filtered by text "Go to next page"
    pageIndicator: '[class*="Page"]',
  };

  /**
   * Get all case rows from the QA review table
   * Returns array of { title, caseId, date, status, aiExperience, ... }
   */
  function getCaseList() {
    const rows = document.querySelectorAll(ASSEMBLED_SELECTORS.caseRows);
    const cases = [];

    rows.forEach((row, i) => {
      if (i === 0) return; // Skip header
      const cells = row.querySelectorAll('td');
      if (cells.length === 0) return;

      const titleBtn = cells[0]?.querySelector('button:first-of-type');
      const caseIdEl = cells[0]?.querySelectorAll('div');

      cases.push({
        index: i - 1,
        title: titleBtn?.textContent?.trim() || '',
        caseId: caseIdEl?.[1]?.textContent?.trim() || '',
        date: caseIdEl?.[2]?.textContent?.trim() || '',
        status: cells[1]?.textContent?.trim() || '',
        chatAgent: cells[2]?.textContent?.trim() || '',
        aiExperience: cells[4]?.textContent?.trim() || '',
        resolution: cells[5]?.textContent?.trim() || '',
        efficiency: cells[6]?.textContent?.trim() || '',
        sentiment: cells[7]?.textContent?.trim() || '',
      });
    });

    return cases;
  }

  /**
   * Click a case row to open the detail dialog
   */
  function openCase(index) {
    const rows = document.querySelectorAll(ASSEMBLED_SELECTORS.caseRows);
    const dataRow = rows[index + 1]; // +1 to skip header
    if (!dataRow) return false;

    const btn = dataRow.querySelector(ASSEMBLED_SELECTORS.caseButton);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  /**
   * Check if dialog is open
   */
  function isDialogOpen() {
    const dialog = document.querySelector(ASSEMBLED_SELECTORS.dialog);
    return !!dialog && dialog.offsetParent !== null;
  }

  /**
   * Extract all messages from the currently open case dialog
   */
  function extractMessages() {
    const dialog = document.querySelector(ASSEMBLED_SELECTORS.dialog);
    if (!dialog) return null;

    const cards = dialog.querySelectorAll(ASSEMBLED_SELECTORS.messageCard);
    const messages = [];

    cards.forEach(card => {
      const senderP = card.querySelector(ASSEMBLED_SELECTORS.senderTitle);
      const sender = senderP?.textContent?.trim() || '';

      const tsP = card.querySelector(ASSEMBLED_SELECTORS.timestamp);
      const timestamp = tsP?.textContent?.trim() || '';

      const msgTexts = card.querySelectorAll(ASSEMBLED_SELECTORS.messageText);
      const content = Array.from(msgTexts).map(p => p.textContent.trim()).join('\n');

      if (sender || content) {
        messages.push({
          sender,
          timestamp,
          content,
          role: sender.includes('Customer') ? 'customer' :
                sender.includes('AI agent') ? 'ai_agent' : 'other',
        });
      }
    });

    return messages;
  }

  /**
   * Extract case metadata from the sidebar of the open dialog
   */
  function extractCaseMetadata() {
    const dialog = document.querySelector(ASSEMBLED_SELECTORS.dialog);
    if (!dialog) return null;

    const metadata = {};

    // Title
    const heading = dialog.querySelector('h2');
    metadata.title = heading?.textContent?.trim() || '';

    // Status badges (Resolved/Abandoned, Poor/Excellent)
    const headingParent = heading?.parentElement;
    if (headingParent) {
      const badges = headingParent.querySelectorAll('div');
      const badgeTexts = Array.from(badges)
        .map(b => b.textContent.trim())
        .filter(t => ['Resolved', 'Abandoned', 'Handed off', 'Poor', 'Excellent', 'Good'].includes(t));
      metadata.outcome = badgeTexts[0] || '';
      metadata.aiExperience = badgeTexts[1] || '';
    }

    // Key-value pairs from sidebar
    const labels = ['Case ID', 'Created at', 'Channel', 'Type', 'AI agent', 'Brand', 'Category', 'User ID'];
    labels.forEach(label => {
      const el = Array.from(dialog.querySelectorAll('div')).find(
        d => d.textContent.trim() === label && d.children.length === 0
      );
      if (el?.nextElementSibling) {
        metadata[label.toLowerCase().replace(/\s+/g, '_')] = el.nextElementSibling.textContent.trim();
      }
    });

    // Scores
    ['Resolution', 'Efficiency', 'Sentiment'].forEach(key => {
      const el = Array.from(dialog.querySelectorAll('div')).find(
        d => d.textContent.trim() === key && d.children.length === 0
      );
      if (el?.nextElementSibling) {
        metadata[key.toLowerCase()] = el.nextElementSibling.textContent.trim();
      }
    });

    return metadata;
  }

  /**
   * Extract full case: metadata + messages
   */
  function extractFullCase() {
    const metadata = extractCaseMetadata();
    const messages = extractMessages();
    if (!metadata && !messages) return null;
    return { ...metadata, messages: messages || [] };
  }

  /**
   * Click Next button in the dialog to go to next case
   */
  function clickNext() {
    const dialog = document.querySelector(ASSEMBLED_SELECTORS.dialog);
    if (!dialog) return false;

    const btn = Array.from(dialog.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Next'
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  /**
   * Click Previous button in the dialog
   */
  function clickPrevious() {
    const dialog = document.querySelector(ASSEMBLED_SELECTORS.dialog);
    if (!dialog) return false;

    const btn = Array.from(dialog.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'Previous'
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  /**
   * Close the dialog
   */
  function closeDialog() {
    const dialog = document.querySelector(ASSEMBLED_SELECTORS.dialog);
    if (!dialog) return false;

    const btn = Array.from(dialog.querySelectorAll('button')).find(
      b => b.textContent.trim() === 'close' || b.getAttribute('aria-label')?.includes('close')
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  /**
   * Go to next page in the table
   */
  function goToNextPage() {
    const btn = Array.from(document.querySelectorAll('button')).find(
      b => b.textContent.trim().includes('Go to next page') || b.getAttribute('aria-label')?.includes('next page')
    );
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  }

  /**
   * Get current page number
   */
  function getCurrentPage() {
    const pageEl = Array.from(document.querySelectorAll('div, span')).find(
      el => el.textContent.trim().match(/^Page \d+$/) && el.children.length === 0
    );
    return pageEl ? parseInt(pageEl.textContent.trim().replace('Page ', '')) : 1;
  }

  /**
   * Scroll the messages container to load all messages
   */
  function scrollMessagesToBottom() {
    const dialog = document.querySelector(ASSEMBLED_SELECTORS.dialog);
    if (!dialog) return false;

    const scrollable = dialog.querySelector('[class*="_messagesContainer_"]')?.parentElement;
    if (scrollable) {
      scrollable.scrollTop = scrollable.scrollHeight;
      return true;
    }
    return false;
  }

  // Expose for service worker
  window.__uniScraper_assembled = {
    getCaseList,
    openCase,
    isDialogOpen,
    extractMessages,
    extractCaseMetadata,
    extractFullCase,
    clickNext,
    clickPrevious,
    closeDialog,
    goToNextPage,
    getCurrentPage,
    scrollMessagesToBottom,
    SELECTORS: ASSEMBLED_SELECTORS,
  };

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'ASSEMBLED_GET_CASES':
        sendResponse({ cases: getCaseList() });
        break;
      case 'ASSEMBLED_OPEN_CASE':
        sendResponse({ ok: openCase(msg.index) });
        break;
      case 'ASSEMBLED_EXTRACT_MESSAGES':
        sendResponse({ messages: extractMessages() });
        break;
      case 'ASSEMBLED_EXTRACT_METADATA':
        sendResponse({ metadata: extractCaseMetadata() });
        break;
      case 'ASSEMBLED_EXTRACT_FULL':
        sendResponse({ data: extractFullCase() });
        break;
      case 'ASSEMBLED_CLICK_NEXT':
        sendResponse({ ok: clickNext() });
        break;
      case 'ASSEMBLED_CLICK_PREVIOUS':
        sendResponse({ ok: clickPrevious() });
        break;
      case 'ASSEMBLED_CLOSE_DIALOG':
        sendResponse({ ok: closeDialog() });
        break;
      case 'ASSEMBLED_NEXT_PAGE':
        sendResponse({ ok: goToNextPage() });
        break;
      case 'ASSEMBLED_GET_PAGE':
        sendResponse({ page: getCurrentPage() });
        break;
      case 'ASSEMBLED_IS_DIALOG_OPEN':
        sendResponse({ open: isDialogOpen() });
        break;
      case 'ASSEMBLED_SCROLL_MESSAGES':
        sendResponse({ ok: scrollMessagesToBottom() });
        break;
      default:
        return false;
    }
    return true;
  });
})();
