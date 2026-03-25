// Generates unique CSS selectors for DOM elements
(function () {
  'use strict';

  function getSelector(el) {
    if (!(el instanceof Element)) return null;

    // Try ID first
    if (el.id) {
      const sel = '#' + CSS.escape(el.id);
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // Try data attributes (more stable than classes)
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && attr.value) {
        const sel = `[${attr.name}="${CSS.escape(attr.value)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }

    // Build path walking up the DOM
    const path = [];
    let current = el;

    while (current && current !== document.body && current !== document.documentElement) {
      let segment = current.tagName.toLowerCase();

      // Add stable classes (skip dynamic-looking ones)
      const stableClasses = Array.from(current.classList)
        .filter(c => !c.match(/^(js-|is-|has-|__|--|\d|css-|sc-|styled-)/))
        .slice(0, 2);

      if (stableClasses.length > 0) {
        segment += '.' + stableClasses.map(c => CSS.escape(c)).join('.');
      }

      path.unshift(segment);

      // Check if current path is unique
      const candidate = path.join(' > ');
      try {
        const matches = document.querySelectorAll(candidate);
        if (matches.length === 1 && matches[0] === el) return candidate;
      } catch (e) {
        // Invalid selector, continue building path
      }

      current = current.parentElement;
    }

    // Add nth-of-type for disambiguation
    const fullPath = [];
    current = el;

    while (current && current !== document.body) {
      let segment = current.tagName.toLowerCase();
      const parent = current.parentElement;

      if (parent) {
        const siblings = Array.from(parent.children).filter(
          s => s.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          segment += `:nth-of-type(${index})`;
        }
      }

      fullPath.unshift(segment);

      const candidate = fullPath.join(' > ');
      try {
        const matches = document.querySelectorAll(candidate);
        if (matches.length === 1 && matches[0] === el) return candidate;
      } catch (e) {
        // continue
      }

      current = current.parentElement;
    }

    // Fallback: full path from body
    return fullPath.join(' > ');
  }

  function getElementBySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  // Expose globally for other content scripts
  window.__uniScraper_getSelector = getSelector;
  window.__uniScraper_getElementBySelector = getElementBySelector;
})();
