# Universal Scraper

A Chrome extension for visually selecting and extracting data from any webpage, including Slack. Point-and-click element selection with red border highlighting, iterative extraction modes, and multi-format export designed for RAG pipelines.

## Features

### Visual Element Picker
- Activate pick mode from the popup or side panel
- **Hover** over any element to see a red dashed border preview
- **Click** to select — element gets a solid red border and is added to your extraction list
- **Click again** to deselect
- Works on any website, including dynamically rendered SPAs

### Extraction Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Single** | Extracts data from the current page only | Product pages, articles, profiles |
| **Pagination** | Mark a "Next" button — auto-clicks through pages and extracts each one | Search results, listings, tables |
| **List** | Mark list items — clicks into each, extracts detail page, goes back, repeats | Directory listings, catalogs |
| **Scroll** | Auto-scrolls the page and collects new content as it loads | Infinite scroll feeds, timelines |

### Slack Support
- Automatically detects `app.slack.com` and injects a specialized adapter
- Uses stable `data-qa` attribute selectors instead of obfuscated class names
- Handles Slack's virtual scrolling (only visible messages are in the DOM)
- Deduplicates messages by timestamp during scroll extraction
- Supports thread expansion and extraction

### Export Formats
All formats are structured for downstream RAG analysis:

- **JSON** — Structured with metadata (URL, timestamp, count) and flat data records
- **CSV** — Tabular format with proper escaping for spreadsheets and data tools
- **Markdown** — Human-readable tables with metadata header
- **HTML** — Preserves original element HTML in a styled document

### Library
- Save any scrape to the built-in library (IndexedDB)
- Browse past scrapes by title, URL, date, and record count
- Re-export saved scrapes in any format at any time
- Delete old scrapes to free storage

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the `universal-scrapper` folder
6. The extension icon (red square) appears in your toolbar

## Usage

### Basic Extraction (Single Page)

1. Navigate to the page you want to scrape
2. Click the extension icon in the toolbar
3. Click **Start Picking** — a red banner appears at the top of the page
4. Hover over elements to preview them (red dashed border)
5. Click elements you want to extract (they get a solid red border)
6. Click **Open Side Panel** to see your selected elements
7. In the side panel, review your selections — you can rename labels, remove items, or clear all
8. Select **Single** extraction mode
9. Click **Start Extraction**
10. View results in the **Results** tab
11. Export as JSON, CSV, Markdown, or HTML

### Pagination Extraction

1. Follow steps 1-6 above to select the data elements you want
2. Select **Pagination** mode in the side panel
3. Click **Mark "Next" Button** — the banner turns amber
4. Click the page's next/pagination button on the webpage — it gets an amber border
5. Set **Max pages** (default: 10)
6. Click **Start Extraction** — the scraper auto-clicks through pages
7. Watch progress in the progress bar. Click **Stop** at any time
8. Results accumulate across all pages

### List Iteration

1. Select the data elements you want to extract from detail pages
2. Select **List** mode
3. Click **Mark List Items** — the banner turns blue
4. Click one of the list items on the page — it gets a blue border (the scraper uses this to find all similar items)
5. Click **Start Extraction** — the scraper clicks each item, extracts data, navigates back, and repeats

### Scroll Extraction

1. Select the data elements you want
2. Select **Scroll** mode
3. Configure **Max scrolls** and **Scroll delay** (time to wait for content to load)
4. Click **Start Extraction** — the scraper auto-scrolls and collects new content
5. Extraction stops when no new content appears or max scrolls is reached

### Scraping Slack

1. Navigate to `app.slack.com` and open a channel
2. The extension automatically injects the Slack adapter
3. Use the visual picker as normal, or use scroll mode to capture message history
4. The adapter handles Slack's virtual scrolling and deduplicates messages by timestamp
5. Export the channel data in your preferred format

### Saving and Re-exporting

1. After extraction, click **Save to Library** in the Results tab
2. Switch to the **Library** tab to browse saved scrapes
3. Each saved scrape shows the URL, record count, mode, and date
4. Click JSON/CSV/MD/HTML buttons on any saved scrape to re-export
5. Click **x** to delete a saved scrape

## Project Structure

```
universal-scrapper/
├── manifest.json                  # Chrome extension manifest (MV3)
├── icons/                         # Extension icons (16/32/48/128px)
├── background/
│   └── service-worker.js          # Central orchestrator — state management,
│                                  #   message routing, iteration loops,
│                                  #   Slack tab detection
├── content/
│   ├── picker.css                 # Injected styles — red/amber/blue borders,
│   │                              #   overlay banner
│   ├── picker.js                  # Visual picker — hover, click, select/deselect,
│   │                              #   special modes (mark next button, mark list items)
│   ├── selector-engine.js         # CSS selector generator — produces unique selectors
│   │                              #   preferring IDs, data attributes, stable classes
│   └── slack-adapter.js           # Slack-specific — data-qa selectors, virtual scroll,
│                                  #   message deduplication, thread extraction
├── sidepanel/
│   ├── sidepanel.html             # Main workspace UI (Tailwind CSS via CDN)
│   └── sidepanel.js               # Side panel controller — element list, mode config,
│                                  #   results table, export, library
├── popup/
│   ├── popup.html                 # Compact popup — toggle pick mode, open side panel
│   └── popup.js                   # Popup controller
├── storage/
│   └── db.js                      # IndexedDB wrapper — CRUD for scrapes and templates
└── shared/
    ├── constants.js               # Message types, extraction modes, status enums
    └── messaging.js               # Promise-based chrome.runtime messaging helper
```

## Architecture

### Communication Flow

```
Popup ──────────> Service Worker ──────────> Content Scripts
                       │                         │
Side Panel <───────────┘                         │ DOM access
                       │                         ▼
                  IndexedDB                  Target Page
```

- **Content scripts** run in the page context. They handle hover/click interactions and DOM reading.
- **Service worker** is the central hub. It owns all state, routes messages, drives iteration loops, and coordinates storage.
- **Side panel** is the primary workspace. It displays selections, configures extraction, shows results, and manages exports.
- **Popup** is a minimal quick-access UI for toggling pick mode and opening the side panel.
- All communication uses `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`.

### Key Design Decisions

- **`outline` instead of `border`** for element highlighting — avoids layout shifts that would reflow the page
- **Side panel as primary UI** — the popup closes when you click on the page, but the side panel stays open alongside it
- **Service worker owns all state** — content scripts and UI are stateless renderers. State is per-tab.
- **No build step** — vanilla JavaScript, no bundler, no framework. Tailwind loaded via CDN.
- **`data-qa` selectors for Slack** — Slack's CSS class names are obfuscated and change between deployments. The `data-qa` attributes are stable testing/accessibility hooks.
- **Dynamic injection** for iterator and Slack adapter — only loaded when needed, keeping the default footprint small.

## Technical Notes

- Built on **Chrome Manifest V3**
- Requires Chrome 116+ (for Side Panel API)
- No external dependencies — runs entirely in the browser
- Data stored in IndexedDB persists across sessions
- Service worker may sleep after inactivity; state is maintained in memory per-tab and restored from IndexedDB where needed
- Content scripts use capture-phase event listeners to intercept clicks before the page handles them

## Permissions

| Permission | Why |
|-----------|-----|
| `activeTab` | Access the current tab's page to inject content scripts |
| `sidePanel` | Open and manage the side panel UI |
| `storage` | Chrome storage API access |
| `scripting` | Dynamically inject scripts (iterator, Slack adapter) |
| `tabs` | Query tab info (URL, title) for state management |
| `<all_urls>` | Run content scripts on any site including Slack |
