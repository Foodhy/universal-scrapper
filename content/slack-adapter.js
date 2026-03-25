// Slack-specific DOM handling for app.slack.com
(function () {
  'use strict';

  // Stable selectors using data-qa attributes (less likely to change than class names)
  const SLACK_SELECTORS = {
    messageContainer: '[data-qa="message_container"], [data-qa="virtual-list-item"]',
    messageContent: '[data-qa="message-text"], [data-qa="message_content"]',
    messageSender: '[data-qa="message_sender_name"], button[data-message-sender]',
    messageTimestamp: '[data-qa="message_timestamp"], time[datetime]',
    threadLink: '[data-qa="replies_button_text"], [data-qa="thread-reply-count"]',
    threadPanel: '[data-qa="thread_messages"], .p-flexpane__inside_body',
    channelName: '[data-qa="channel_name"], [data-qa="channel-header-channel-name"]',
    messageList: '[data-qa="message_list"], .c-virtual_list__scroll_container',
  };

  // Track seen messages to avoid duplicates during scroll extraction
  const seenMessages = new Set();

  function getSlackMessages() {
    const messages = [];
    const containers = document.querySelectorAll(SLACK_SELECTORS.messageContainer);

    containers.forEach(container => {
      // Get timestamp for dedup
      const tsEl = container.querySelector(SLACK_SELECTORS.messageTimestamp);
      const timestamp = tsEl?.getAttribute('datetime') ||
                        tsEl?.textContent?.trim() ||
                        container.getAttribute('data-ts') ||
                        '';

      // Skip if already seen
      const msgId = timestamp || container.textContent?.slice(0, 100);
      if (seenMessages.has(msgId)) return;
      seenMessages.add(msgId);

      // Extract message data
      const senderEl = container.querySelector(SLACK_SELECTORS.messageSender);
      const contentEl = container.querySelector(SLACK_SELECTORS.messageContent);

      if (contentEl) {
        messages.push({
          sender: senderEl?.textContent?.trim() || 'Unknown',
          content: contentEl.textContent?.trim() || '',
          html: contentEl.innerHTML || '',
          timestamp: timestamp,
          hasThread: !!container.querySelector(SLACK_SELECTORS.threadLink),
        });
      }
    });

    return messages;
  }

  function scrollMessageList(direction = 'down') {
    const scrollContainer = document.querySelector(SLACK_SELECTORS.messageList);
    if (!scrollContainer) {
      window.scrollTo(0, document.body.scrollHeight);
      return;
    }

    if (direction === 'down') {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    } else {
      scrollContainer.scrollTop = 0;
    }
  }

  async function extractThread(threadButton) {
    if (!threadButton) return [];

    threadButton.click();
    // Wait for thread panel to open
    await new Promise(r => setTimeout(r, 1500));

    const threadPanel = document.querySelector(SLACK_SELECTORS.threadPanel);
    if (!threadPanel) return [];

    const messages = [];
    const threadMsgs = threadPanel.querySelectorAll(SLACK_SELECTORS.messageContainer);

    threadMsgs.forEach(container => {
      const senderEl = container.querySelector(SLACK_SELECTORS.messageSender);
      const contentEl = container.querySelector(SLACK_SELECTORS.messageContent);
      const tsEl = container.querySelector(SLACK_SELECTORS.messageTimestamp);

      if (contentEl) {
        messages.push({
          sender: senderEl?.textContent?.trim() || 'Unknown',
          content: contentEl.textContent?.trim() || '',
          html: contentEl.innerHTML || '',
          timestamp: tsEl?.getAttribute('datetime') || tsEl?.textContent?.trim() || '',
          isThreadReply: true,
        });
      }
    });

    return messages;
  }

  function getChannelName() {
    const el = document.querySelector(SLACK_SELECTORS.channelName);
    return el?.textContent?.trim() || 'unknown-channel';
  }

  function resetSeenMessages() {
    seenMessages.clear();
  }

  // Expose for service worker to call via executeScript
  window.__uniScraper_slack = {
    getSlackMessages,
    scrollMessageList,
    extractThread,
    getChannelName,
    resetSeenMessages,
    SELECTORS: SLACK_SELECTORS,
  };

  // Listen for Slack-specific extraction messages
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SLACK_EXTRACT_MESSAGES') {
      const messages = getSlackMessages();
      sendResponse({ messages });
    }
    if (msg.type === 'SLACK_SCROLL') {
      scrollMessageList(msg.direction || 'down');
      sendResponse({ ok: true });
    }
    if (msg.type === 'SLACK_GET_CHANNEL') {
      sendResponse({ channel: getChannelName() });
    }
    if (msg.type === 'SLACK_RESET') {
      resetSeenMessages();
      sendResponse({ ok: true });
    }
    return true;
  });
})();
