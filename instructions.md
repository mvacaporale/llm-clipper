## Core Flow

1. User clicks extension icon → activates "highlight mode" (icon changes to indicate active state)
2. While highlight mode is active, any text selection automatically gets visually highlighted (yellow background) and added to a queue
3. User clicks extension icon again → triggers export to Notion
4. Extension creates a new Notion page with all highlights
5. Popup briefly appears displaying a clickable link to the newly created Notion page
6. Highlight mode deactivates and queue clears

Keyboard shortcut (Ctrl+Shift+H / Cmd+Shift+H) should also toggle between these states.

## Supported Sites

Detect which LLM based on hostname:
- `chat.openai.com` and `chatgpt.com` → "ChatGPT"
- `claude.ai` → "Claude"
- `gemini.google.com` → "Gemini"

## Notion Page Format

**Title:** `{LLM Name} Highlights - {Month DD, YYYY h:mm AM/PM}`

**Page content:**
```
Source: {LLM Name}
URL: {conversation URL}
Exported: {full timestamp}

---

• {first highlight}
• {second highlight}
• {third highlight}
...
```

## Extension Structure

```
manifest.json
content.js      - Injected into LLM sites, handles selection detection and visual highlighting
background.js   - Manages storage, handles Notion API calls, handles icon click logic
popup.html      - Minimal UI that shows Notion link after export
popup.js        - Popup logic
styles.css      - Highlight styling (yellow background for highlighted text)
```

## Icon States

- **Inactive:** Default/grayed icon - highlight mode off
- **Active:** Colored/highlighted icon - highlight mode on, collecting highlights

## Features

- **Single icon click toggles state:** Off → Highlight mode on. On (with highlights) → Export and reset.
- **Keyboard shortcut:** Ctrl/Cmd+Shift+H does the same toggle
- **Visual feedback:** Highlighted text gets yellow background
- **Export result:** After export, popup appears with clickable Notion URL
- **Edge case:** If user clicks icon while in highlight mode but with zero highlights, show a message "No highlights to export" and return to inactive state

## Configuration

User needs to configure (via options page or first-run setup):
- Notion API key (internal integration token)
- Parent page ID (where new highlight pages will be created)

## Technical Notes

- Use Manifest V3
- Content script should only activate on the supported LLM sites
- Notion API calls must go through background.js (service worker) to avoid CORS
- After successful export, clear the highlights queue and deactivate highlight mode automatically
