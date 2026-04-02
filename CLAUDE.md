# LLM Clipper - Chrome Extension

A Chrome extension for highlighting text on LLM chat sites (ChatGPT, Claude, Gemini) and exporting to Readwise or Notion. Also supports sending any webpage to an LLM for analysis.

## Features

1. **Highlight Mode**: Select text on LLM sites to capture highlights
2. **Cross-Tab Highlighting**: Accumulate highlights across multiple chat windows
3. **Readwise Export**: Send highlights directly to Readwise for review and retention
4. **Notion Export**: Save highlights to new or existing Notion pages with fuzzy search
5. **Read with LLM**: Send any webpage's content to ChatGPT, Claude, or Gemini for analysis

## Architecture

### Files

- `manifest.json` - Extension manifest (Manifest V3)
- `background.js` - Service worker handling state, Notion API, message passing
- `content.js` - Content script for highlight detection on LLM sites
- `popup.js` / `popup.html` - Extension popup UI
- `options.js` / `options.html` - Settings page for Notion configuration
- `styles.css` - CSS for highlight styling (uses CSS Custom Highlight API)

### State Management

State is persisted to `chrome.storage.session` (with `chrome.storage.local` fallback):

```javascript
state = {
  highlightModeActive: boolean,
  highlights: Array<{ text: string, url: string, llm: string }>,
  currentTabId: number
}
```

Key functions in `background.js`:
- `loadState()` / `saveState()` - Persist state to storage
- `searchNotionPages(query)` - Fuzzy search Notion pages via search API
- `createNotionPage()` - Create new page with grouped highlights
- `appendToNotionPage()` - Append highlights to existing page
- `groupHighlightsBySource()` - Groups highlights by source URL for export

### Content Script Sync

The content script (`content.js`) syncs with background state:
- On load: checks if highlight mode is active
- On visibility change: re-syncs when tab becomes visible (for cross-tab support)
- Uses `syncHighlightState()` function

### Highlight Storage Format

Highlights are stored as objects with source information:
```javascript
{
  text: "highlighted text",
  url: "https://claude.ai/chat/xxx",
  llm: "Claude"  // or "ChatGPT", "Gemini"
}
```

This enables grouping by source when exporting to Notion.

## Notion API Integration

### Required Permissions
- Notion integration needs access to pages where highlights will be saved
- Parent page ID configured in options

### API Endpoints Used
- `POST /v1/search` - Fuzzy search all accessible pages
- `POST /v1/pages` - Create new page
- `PATCH /v1/blocks/{id}/children` - Append blocks to existing page
- `GET /v1/pages/{id}` - Get page URL after creation

### Export Format

Highlights are grouped by source URL:
```
Exported: [timestamp]
---
### Claude (link)
• Highlight 1
• Highlight 2

### ChatGPT (link)
• Highlight 3
```

## Message Actions

Messages between popup/content scripts and background:

| Action | Description |
|--------|-------------|
| `addHighlight` | Add highlight with text, url, llm |
| `removeHighlight` | Remove highlight by index |
| `removeHighlights` | Remove multiple highlights by indices |
| `getHighlights` | Get all stored highlights |
| `getHighlightMode` | Check if highlight mode is active |
| `toggleHighlightMode` | Toggle mode, export to Notion if has highlights |
| `exportToReadwise` | Export highlights to Readwise |
| `cancelHighlightMode` | Cancel without exporting |
| `searchPages` | Search Notion pages with query |
| `getState` | Get current state |
| `checkConfig` | Check if Readwise/Notion configured (returns `{configured, readwise, notion}`) |
| `setHighlightMode` | Sent to content script to activate/deactivate |
| `showMessage` | Show toast in content script |
| `getPageInfo` | Get LLM type and URL from content script |

## Read with LLM Feature

When clicking extension on non-LLM pages:
1. Shows popup with Gemini/Claude/ChatGPT buttons
2. Extracts page content using `chrome.scripting.executeScript`
3. Stores prompt in `chrome.storage.local.pendingLLMContent`
4. Opens LLM in new tab
5. Content script detects pending content and pastes into input

### YouTube Support

For YouTube videos (`youtube.com/watch` or `youtu.be/`):
1. Extracts transcript from `ytInitialPlayerResponse` embedded in page
2. Fetches caption track JSON (`baseUrl + '&fmt=json3'`)
3. Parses transcript events and joins text segments
4. Falls back to video description if no transcript available
5. Uses YouTube-specific prompt mentioning "transcript" vs "article"

Key functions in `popup.js`:
- `isYouTubeVideo(url)` - Detects YouTube URLs
- `extractYouTubeTranscript(tabId)` - Extracts transcript from page data

### Regular Pages

Content extraction selectors (in order):
- `article`, `[role="article"]`, `.article-content`, `.post-content`, `.entry-content`, `main`, `.content`
- Fallback: `document.body.innerText`
- Truncated to 15,000 characters

## Environment Variables

Configured via options page, stored in `chrome.storage.sync`:
- `readwiseToken` - Readwise access token (from readwise.io/access_token)
- `notionApiKey` - Notion integration token
- `notionParentPageId` - Parent page for new highlight pages

## Readwise API Integration

### Endpoint
- `POST https://readwise.io/api/v2/highlights/`

### Authentication
- Header: `Authorization: Token ACCESS_TOKEN`

### Request Format
```json
{
  "highlights": [
    {
      "text": "highlight text",
      "title": "Claude Chat",
      "source_url": "https://claude.ai/chat/xxx",
      "source_type": "llm_clipper",
      "category": "articles",
      "highlighted_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### Response
- 200 OK with created highlight IDs

## Development Notes

### CSS Custom Highlight API
Uses the modern CSS Custom Highlight API for non-destructive highlighting:
```javascript
clipperHighlight = new Highlight();
CSS.highlights.set('llm-clipper', clipperHighlight);
```

Styled via `::highlight(llm-clipper)` in styles.css.

### Popup Width
Currently 240px - may need adjustment if adding more UI elements.

### Debouncing
Search input uses 300ms debounce to avoid excessive API calls.
