# LLM Clipper

A Chrome extension for capturing highlights from AI chat interfaces (ChatGPT, Claude, Gemini) and exporting them to Readwise or Notion. Also includes a "Read with LLM" feature to send any webpage to an AI for analysis.

## Features

- **Highlight Mode** - Select text on LLM chat sites to capture highlights
- **Cross-Tab Support** - Accumulate highlights across multiple chat windows before exporting
- **Readwise Export** - Send highlights directly to Readwise for spaced repetition review
- **Notion Export** - Save highlights to new or existing Notion pages with fuzzy search
- **Read with LLM** - Send any webpage's content (including YouTube transcripts) to ChatGPT, Claude, or Gemini

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension folder

## Setup

### Readwise (Recommended)

1. Go to [readwise.io/access_token](https://readwise.io/access_token)
2. Copy your access token
3. Click the extension icon → right-click → "Options"
4. Paste your token and save

### Notion (Optional)

1. Go to [Notion Integrations](https://www.notion.so/my-integrations) and create a new integration
2. Copy the Internal Integration Token (starts with `secret_`)
3. Create or choose a Notion page to store highlights
4. Share that page with your integration (click ... → Add connections)
5. Copy the page ID from the URL
6. Add both values in extension options

## Usage

### Capturing Highlights

1. Navigate to any ChatGPT, Claude, or Gemini chat
2. Click the extension icon to activate highlight mode (icon turns active)
3. Select text you want to save - it will be highlighted in yellow
4. Switch between chat tabs to capture more highlights
5. Click the extension icon again to export

### Exporting

When you click to export:
- **Readwise only configured**: Highlights go directly to Readwise
- **Both configured**: Choose between Readwise or Notion
- **Notion only**: Search for an existing page or create a new one

Each highlight includes a link back to the original chat conversation.

### Read with LLM

On any non-LLM webpage:
1. Click the extension icon
2. Choose Gemini, Claude, or ChatGPT
3. The page content (or YouTube transcript) is extracted and sent to a new chat

## Supported Sites

- chat.openai.com / chatgpt.com
- claude.ai
- gemini.google.com

## Keyboard Shortcut

You can set a keyboard shortcut in `chrome://extensions/shortcuts` to quickly toggle highlight mode.

## How It Works

- Uses the CSS Custom Highlight API for non-destructive text highlighting
- Highlights are stored in `chrome.storage.session` (persists across service worker restarts)
- Source URLs are captured with each highlight for attribution
- YouTube transcript extraction uses the embedded `ytInitialPlayerResponse` data

## Privacy

- All data stays local until you explicitly export
- API tokens are stored in Chrome's sync storage
- No analytics or tracking

## License

MIT
