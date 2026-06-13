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

  // Build a selector for the table element itself
  function getTableSelector(table) {
    if (table.id) {
      const sel = '#' + CSS.escape(table.id);
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    // Try stable classes
    const stableClasses = Array.from(table.classList)
      .filter(c => !c.match(/^(js-|is-|has-|__|--|\d|css-|sc-|styled-)/))
      .slice(0, 2);
    if (stableClasses.length > 0) {
      const sel = 'table.' + stableClasses.map(c => CSS.escape(c)).join('.');
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    // Fallback: use getSelector on the table
    return getSelector(table);
  }

  // Build a selector for a generic container (ul, ol, div, etc.)
  function getContainerSelector(container) {
    if (container.id) {
      const sel = '#' + CSS.escape(container.id);
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    const tag = container.tagName.toLowerCase();
    const stableClasses = Array.from(container.classList)
      .filter(c => !c.match(/^(js-|is-|has-|__|--|\d|css-|sc-|styled-)/))
      .slice(0, 2);
    if (stableClasses.length > 0) {
      const sel = tag + '.' + stableClasses.map(c => CSS.escape(c)).join('.');
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    return getSelector(container);
  }

  // Compute the nth-of-type index (1-based) among same-tag siblings
  function getNthOfType(el) {
    const parent = el.parentElement;
    if (!parent) return 1;
    const tag = el.tagName;
    const siblings = Array.from(parent.children).filter(s => s.tagName === tag);
    return siblings.indexOf(el) + 1;
  }

  // Build a relative path from ancestor (exclusive) down to el
  function getRelativePath(el, ancestor) {
    const parts = [];
    let current = el;
    while (current && current !== ancestor) {
      let segment = current.tagName.toLowerCase();
      const nth = getNthOfType(current);
      const sameTagCount = current.parentElement
        ? Array.from(current.parentElement.children).filter(s => s.tagName === current.tagName).length
        : 1;
      if (sameTagCount > 1) {
        segment += `:nth-of-type(${nth})`;
      }
      parts.unshift(segment);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  /**
   * Generate a generalized selector that matches ALL similar elements
   * (e.g., all cells in a table column, all items in a list).
   * Returns { selector, matchCount } or null if can't generalize.
   */
  function getColumnSelector(el) {
    if (!(el instanceof Element)) return null;

    // --- TABLE CASE: <td> or <th> ---
    const cell = el.closest('td, th');
    if (cell) {
      const table = cell.closest('table');
      if (!table) return null;

      const colIndex = getNthOfType(cell);
      const cellTag = cell.tagName.toLowerCase();
      const tableSelector = getTableSelector(table);

      // Determine if it's in thead or tbody
      const section = cell.closest('thead, tbody, tfoot');
      const sectionTag = section ? section.tagName.toLowerCase() : null;

      // If the clicked element is deeper inside the cell, build path from cell
      let innerPath = '';
      if (el !== cell) {
        innerPath = ' ' + getRelativePath(el, cell);
      }

      // Try with section first (more precise)
      if (sectionTag) {
        const candidate = `${tableSelector} ${sectionTag} tr > ${cellTag}:nth-of-type(${colIndex})${innerPath}`;
        try {
          const matches = document.querySelectorAll(candidate);
          if (matches.length > 1 && Array.from(matches).includes(el)) {
            return { selector: candidate, matchCount: matches.length };
          }
        } catch (e) { /* invalid selector */ }
      }

      // Try without section
      const candidate = `${tableSelector} tr > ${cellTag}:nth-of-type(${colIndex})${innerPath}`;
      try {
        const matches = document.querySelectorAll(candidate);
        if (matches.length > 1 && Array.from(matches).includes(el)) {
          return { selector: candidate, matchCount: matches.length };
        }
      } catch (e) { /* invalid selector */ }

      return null;
    }

    // --- LIST CASE: <li> inside <ul>/<ol> ---
    const li = el.closest('li');
    if (li) {
      const list = li.closest('ul, ol');
      if (!list) return null;

      const listSelector = getContainerSelector(list);

      // If clicked element is the <li> itself
      if (el === li) {
        const candidate = `${listSelector} > li`;
        try {
          const matches = document.querySelectorAll(candidate);
          if (matches.length > 1 && Array.from(matches).includes(el)) {
            return { selector: candidate, matchCount: matches.length };
          }
        } catch (e) { /* invalid selector */ }
      } else {
        // Clicked element is deeper inside <li>
        const innerPath = getRelativePath(el, li);
        const candidate = `${listSelector} > li > ${innerPath}`;
        try {
          const matches = document.querySelectorAll(candidate);
          if (matches.length > 1 && Array.from(matches).includes(el)) {
            return { selector: candidate, matchCount: matches.length };
          }
        } catch (e) { /* invalid selector */ }
      }

      return null;
    }

    // --- GENERIC REPEATING STRUCTURE (div grids, etc.) ---
    // Walk up to find a parent whose parent has multiple same-tag+class siblings
    let current = el;
    for (let depth = 0; depth < 5 && current && current !== document.body; depth++) {
      const parent = current.parentElement;
      if (!parent) break;
      const grandparent = parent.parentElement;
      if (!grandparent) break;

      // Check if grandparent has multiple children matching parent's tag + classes
      const parentTag = parent.tagName.toLowerCase();
      const parentClasses = Array.from(parent.classList)
        .filter(c => !c.match(/^(js-|is-|has-|__|--|\d|css-|sc-|styled-)/))
        .slice(0, 2);

      let rowSelector = parentTag;
      if (parentClasses.length > 0) {
        rowSelector += '.' + parentClasses.map(c => CSS.escape(c)).join('.');
      }

      const siblings = grandparent.querySelectorAll(`:scope > ${rowSelector}`);
      if (siblings.length > 1) {
        // Found repeating rows! Build selector
        const containerSelector = getContainerSelector(grandparent);
        const innerPath = getRelativePath(el, parent);
        const candidate = `${containerSelector} > ${rowSelector} > ${innerPath}`;
        try {
          const matches = document.querySelectorAll(candidate);
          if (matches.length > 1 && Array.from(matches).includes(el)) {
            return { selector: candidate, matchCount: matches.length };
          }
        } catch (e) { /* invalid selector */ }
      }

      current = parent;
    }

    return null;
  }

  /**
   * For a <td>, find the corresponding <th> header text in the same column.
   */
  function getColumnHeader(el) {
    const cell = el.closest('td, th');
    if (!cell) return null;

    const table = cell.closest('table');
    if (!table) return null;

    const colIndex = getNthOfType(cell) - 1; // 0-based for array access

    // Look for <th> in thead or first row
    const thead = table.querySelector('thead');
    if (thead) {
      const ths = thead.querySelectorAll('th');
      if (ths[colIndex]) {
        return (ths[colIndex].textContent || '').trim();
      }
    }

    // Fallback: check first row for <th> elements
    const firstRow = table.querySelector('tr');
    if (firstRow) {
      const ths = firstRow.querySelectorAll('th');
      if (ths[colIndex]) {
        return (ths[colIndex].textContent || '').trim();
      }
    }

    return null;
  }

  // Expose globally for other content scripts
  window.__uniScraper_getSelector = getSelector;
  window.__uniScraper_getElementBySelector = getElementBySelector;
  window.__uniScraper_getColumnSelector = getColumnSelector;
  window.__uniScraper_getColumnHeader = getColumnHeader;
})();
