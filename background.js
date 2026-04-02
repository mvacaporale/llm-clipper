// LLM Clipper - Background Service Worker
// Manages storage, Notion API calls, and extension state

// State management - persisted to chrome.storage.session
// This survives service worker restarts and tab switches
let state = {
  highlightModeActive: false,
  highlights: [],
  currentTabId: null
};

// Load state from storage on startup
async function loadState() {
  try {
    const result = await chrome.storage.session.get(['clipperState']);
    if (result.clipperState) {
      state = result.clipperState;
    }
  } catch (e) {
    // Session storage not available, use local storage as fallback
    const result = await chrome.storage.local.get(['clipperState']);
    if (result.clipperState) {
      state = result.clipperState;
    }
  }
}

// Save state to storage
async function saveState() {
  try {
    await chrome.storage.session.set({ clipperState: state });
  } catch (e) {
    // Session storage not available, use local storage as fallback
    await chrome.storage.local.set({ clipperState: state });
  }
}

// Initialize state on startup
loadState();

// Icon paths
const ICONS = {
  inactive: {
    16: 'icons/icon-inactive-16.png',
    48: 'icons/icon-inactive-48.png',
    128: 'icons/icon-inactive-128.png'
  },
  active: {
    16: 'icons/icon-active-16.png',
    48: 'icons/icon-active-48.png',
    128: 'icons/icon-active-128.png'
  }
};

// Update extension icon based on state
async function updateIcon(active) {
  const icons = active ? ICONS.active : ICONS.inactive;
  await chrome.action.setIcon({ path: icons });
}

// Get Readwise configuration from storage
async function getReadwiseConfig() {
  const result = await chrome.storage.sync.get(['readwiseToken']);
  return {
    token: result.readwiseToken
  };
}

// Get Notion configuration from storage
async function getNotionConfig() {
  const result = await chrome.storage.sync.get(['notionApiKey', 'notionParentPageId']);
  return {
    apiKey: result.notionApiKey,
    parentPageId: result.notionParentPageId
  };
}

// Export highlights to Readwise
async function exportToReadwise(highlights) {
  const config = await getReadwiseConfig();

  if (!config.token) {
    throw new Error('Readwise not configured. Please add your access token in settings.');
  }

  // Group highlights by source
  const groupedHighlights = groupHighlightsBySource(highlights);

  // Build Readwise highlights array
  const readwiseHighlights = [];

  groupedHighlights.forEach(group => {
    group.texts.forEach(text => {
      readwiseHighlights.push({
        text: text,
        title: `${group.llm} Chat`,
        source_url: group.url || undefined,
        source_type: 'llm_clipper',
        category: 'articles',
        highlighted_at: new Date().toISOString()
      });
    });
  });

  const response = await fetch('https://readwise.io/api/v2/highlights/', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ highlights: readwiseHighlights })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Readwise API error: ${error}`);
  }

  return { count: readwiseHighlights.length };
}

// Search Notion pages using the search API
async function searchNotionPages(query = '') {
  const config = await getNotionConfig();

  if (!config.apiKey) {
    return [];
  }

  try {
    // Use Notion search API for fuzzy search across all pages
    const searchBody = {
      filter: {
        property: 'object',
        value: 'page'
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      },
      page_size: 20
    };

    // Add query if provided
    if (query.trim()) {
      searchBody.query = query.trim();
    }

    const response = await fetch(
      'https://api.notion.com/v1/search',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify(searchBody)
      }
    );

    if (!response.ok) {
      console.error('Failed to search Notion pages');
      return [];
    }

    const data = await response.json();

    // Extract page info from results
    const pages = data.results.map(page => {
      // Get title from properties
      let title = 'Untitled';
      if (page.properties?.title?.title?.[0]?.plain_text) {
        title = page.properties.title.title[0].plain_text;
      } else if (page.properties?.Name?.title?.[0]?.plain_text) {
        title = page.properties.Name.title[0].plain_text;
      }

      return {
        id: page.id,
        title: title,
        lastEdited: page.last_edited_time,
        icon: page.icon?.emoji || null
      };
    });

    return pages;
  } catch (error) {
    console.error('Error searching Notion pages:', error);
    return [];
  }
}

// Append highlights to an existing Notion page
async function appendToNotionPage(pageId, llmName, pageUrl, highlights) {
  const config = await getNotionConfig();

  if (!config.apiKey) {
    throw new Error('Notion not configured.');
  }

  const now = new Date();

  // Group highlights by source
  const groupedHighlights = groupHighlightsBySource(highlights);

  // Build blocks to append
  const children = [
    // Divider to separate from existing content
    {
      object: 'block',
      type: 'divider',
      divider: {}
    },
    // Header for this batch
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [
          { type: 'text', text: { content: `Added ${formatDate(now)}` } }
        ]
      }
    }
  ];

  // Add highlights grouped by source
  groupedHighlights.forEach((group, index) => {
    // Add source subheader for each group
    if (group.url) {
      children.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            { type: 'text', text: { content: `${group.llm} ` } },
            { type: 'text', text: { content: '(link)', link: { url: group.url } } }
          ]
        }
      });
    } else {
      children.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            { type: 'text', text: { content: group.llm } }
          ]
        }
      });
    }

    // Add highlight bullets for this group (truncate to Notion's 2000 char limit)
    group.texts.forEach(text => {
      children.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [
            { type: 'text', text: { content: truncateForNotion(text) } }
          ]
        }
      });
    });

    // Add spacing between groups (except for last)
    if (index < groupedHighlights.length - 1) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [] }
      });
    }
  });

  // Append blocks to the page in batches
  await appendBlocksInBatches(pageId, children, config.apiKey);

  // Get the page URL
  const pageResponse = await fetch(
    `https://api.notion.com/v1/pages/${pageId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    }
  );

  if (pageResponse.ok) {
    const pageData = await pageResponse.json();
    return pageData.url;
  }

  return null;
}

// Format date for Notion page title
function formatDate(date) {
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Format full timestamp
function formatFullTimestamp(date) {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// Truncate text to Notion's 2000 character limit for rich_text
function truncateForNotion(text, maxLength = 2000) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Append blocks to a page in batches (Notion limit: 100 blocks per request)
async function appendBlocksInBatches(pageId, blocks, apiKey) {
  const BATCH_SIZE = 100;

  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);

    const response = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({ children: batch })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Notion API error: ${error.message || response.statusText}`);
    }
  }
}

// Group highlights by source URL
function groupHighlightsBySource(highlights) {
  const groups = new Map();

  highlights.forEach(h => {
    // Handle both old format (string) and new format (object)
    const highlight = typeof h === 'string' ? { text: h, url: '', llm: 'Unknown' } : h;
    const key = highlight.url || 'unknown';

    if (!groups.has(key)) {
      groups.set(key, {
        url: highlight.url,
        llm: highlight.llm,
        texts: []
      });
    }
    groups.get(key).texts.push(highlight.text);
  });

  return Array.from(groups.values());
}

// Create Notion page with highlights
async function createNotionPage(llmName, pageUrl, highlights, customTitle = null) {
  const config = await getNotionConfig();

  if (!config.apiKey || !config.parentPageId) {
    throw new Error('Notion not configured. Please set up your API key and parent page ID in options.');
  }

  const now = new Date();

  // Group highlights by source
  const groupedHighlights = groupHighlightsBySource(highlights);

  // Determine title - use custom or generate from sources
  let title;
  if (customTitle) {
    title = customTitle;
  } else if (groupedHighlights.length === 1) {
    title = `${groupedHighlights[0].llm} Highlights - ${formatDate(now)}`;
  } else {
    const llms = [...new Set(groupedHighlights.map(g => g.llm))].join(', ');
    title = `${llms} Highlights - ${formatDate(now)}`;
  }

  // Build page content blocks
  const children = [
    // Export timestamp
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { type: 'text', text: { content: 'Exported: ' }, annotations: { bold: true } },
          { type: 'text', text: { content: formatFullTimestamp(now) } }
        ]
      }
    },
    {
      object: 'block',
      type: 'divider',
      divider: {}
    }
  ];

  // Add highlights grouped by source
  groupedHighlights.forEach((group, index) => {
    // Add source header for each group
    if (group.url) {
      children.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            { type: 'text', text: { content: `${group.llm} ` } },
            { type: 'text', text: { content: '(link)', link: { url: group.url } } }
          ]
        }
      });
    } else {
      children.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            { type: 'text', text: { content: group.llm } }
          ]
        }
      });
    }

    // Add highlight bullets for this group (truncate to Notion's 2000 char limit)
    group.texts.forEach(text => {
      children.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [
            { type: 'text', text: { content: truncateForNotion(text) } }
          ]
        }
      });
    });

    // Add spacing between groups (except for last)
    if (index < groupedHighlights.length - 1) {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [] }
      });
    }
  });

  // Create the page via Notion API (with first batch of children, max 100)
  const BATCH_SIZE = 100;
  const firstBatch = children.slice(0, BATCH_SIZE);
  const remainingBlocks = children.slice(BATCH_SIZE);

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { page_id: config.parentPageId },
      properties: {
        title: {
          title: [
            { type: 'text', text: { content: title } }
          ]
        }
      },
      children: firstBatch
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Notion API error: ${error.message || response.statusText}`);
  }

  const page = await response.json();

  // Append remaining blocks in batches if needed
  if (remainingBlocks.length > 0) {
    await appendBlocksInBatches(page.id, remainingBlocks, config.apiKey);
  }

  return page.url;
}

// Safe message sender that handles errors
function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

// Toggle highlight mode
async function toggleHighlightMode(tabId, options = {}) {
  await loadState(); // Ensure we have latest state

  // Check Notion config first
  const config = await getNotionConfig();
  if (!config.apiKey || !config.parentPageId) {
    await sendToTab(tabId, {
      action: 'showMessage',
      text: 'Please configure Notion in extension settings',
      duration: 3000
    });
    chrome.runtime.openOptionsPage();
    return { status: 'error', message: 'Not configured' };
  }

  if (!state.highlightModeActive) {
    // Activate highlight mode
    state.highlightModeActive = true;
    state.currentTabId = tabId;
    state.highlights = [];
    await saveState();
    await updateIcon(true);

    // Notify content script
    await sendToTab(tabId, { action: 'setHighlightMode', active: true });

    return { status: 'activated' };
  } else {
    // Check if we have highlights to export
    if (state.highlights.length === 0) {
      // No highlights - deactivate and show message
      state.highlightModeActive = false;
      await saveState();
      await updateIcon(false);
      await sendToTab(tabId, { action: 'setHighlightMode', active: false });
      await sendToTab(tabId, {
        action: 'showMessage',
        text: 'No highlights to export',
        duration: 2000
      });
      return { status: 'noHighlights', message: 'No highlights to export' };
    }

    // If we need to get a page name, return pending status
    if (options.getPageName) {
      return {
        status: 'pendingName',
        highlightCount: state.highlights.length,
        highlights: state.highlights
      };
    }

    // Get page info from content script
    const pageInfo = await sendToTab(tabId, { action: 'getPageInfo' });

    try {
      // Export to Notion
      const llmName = pageInfo?.llm || 'Unknown';
      const pageUrl = pageInfo?.url || '';
      let notionUrl;

      if (options.existingPageId) {
        // Append to existing page
        notionUrl = await appendToNotionPage(options.existingPageId, llmName, pageUrl, state.highlights);
      } else {
        // Create new page
        const customTitle = options.pageTitle || null;
        notionUrl = await createNotionPage(llmName, pageUrl, state.highlights, customTitle);
      }

      // Reset state
      state.highlightModeActive = false;
      state.highlights = [];
      await saveState();
      await updateIcon(false);
      await sendToTab(tabId, { action: 'setHighlightMode', active: false });
      await sendToTab(tabId, { action: 'exportComplete' });

      return { status: 'exported', notionUrl };
    } catch (error) {
      await sendToTab(tabId, {
        action: 'showMessage',
        text: `Export failed: ${error.message}`,
        duration: 4000
      });
      return { status: 'error', message: error.message };
    }
  }
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'addHighlight':
      (async () => {
        await loadState();
        if (state.highlightModeActive && message.text) {
          // Store highlight with source info
          state.highlights.push({
            text: message.text,
            url: message.url || '',
            llm: message.llm || 'Unknown'
          });
          await saveState();
        }
        sendResponse({ success: true, count: state.highlights.length });
      })();
      return true; // Async response

    case 'removeHighlight':
      (async () => {
        await loadState();
        if (message.index >= 0 && message.index < state.highlights.length) {
          state.highlights.splice(message.index, 1);
          await saveState();
        }
        sendResponse({ success: true, count: state.highlights.length });
      })();
      return true; // Async response

    case 'removeHighlights':
      (async () => {
        await loadState();
        // Remove multiple indices (must be sorted descending to maintain correct indices)
        if (message.indices && Array.isArray(message.indices)) {
          const sortedIndices = [...message.indices].sort((a, b) => b - a);
          for (const index of sortedIndices) {
            if (index >= 0 && index < state.highlights.length) {
              state.highlights.splice(index, 1);
            }
          }
          await saveState();
        }
        sendResponse({ success: true, count: state.highlights.length });
      })();
      return true; // Async response

    case 'getHighlights':
      (async () => {
        await loadState();
        sendResponse({ highlights: state.highlights, count: state.highlights.length });
      })();
      return true; // Async response

    case 'getHighlightMode':
      (async () => {
        await loadState();
        sendResponse({ active: state.highlightModeActive, count: state.highlights.length });
      })();
      return true; // Async response

    case 'toggleHighlightMode':
      (async () => {
        const tabId = message.tabId || sender.tab?.id;
        const options = {
          getPageName: message.getPageName,
          pageTitle: message.pageTitle,
          existingPageId: message.existingPageId
        };
        if (tabId) {
          const result = await toggleHighlightMode(tabId, options);
          sendResponse(result);
        } else {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            const result = await toggleHighlightMode(tab.id, options);
            sendResponse(result);
          } else {
            sendResponse({ status: 'error', message: 'No active tab found' });
          }
        }
      })();
      return true; // Async response

    case 'searchPages':
      (async () => {
        const pages = await searchNotionPages(message.query || '');
        sendResponse({ pages });
      })();
      return true; // Async response

    case 'getState':
      (async () => {
        await loadState();
        sendResponse({
          active: state.highlightModeActive,
          highlightCount: state.highlights.length
        });
      })();
      return true; // Async response

    case 'checkConfig':
      (async () => {
        const notionConfig = await getNotionConfig();
        const readwiseConfig = await getReadwiseConfig();
        const notionConfigured = !!(notionConfig.apiKey && notionConfig.parentPageId);
        const readwiseConfigured = !!readwiseConfig.token;
        sendResponse({
          configured: notionConfigured || readwiseConfigured,
          notion: notionConfigured,
          readwise: readwiseConfigured
        });
      })();
      return true; // Async response

    case 'exportToReadwise':
      (async () => {
        await loadState();
        if (state.highlights.length === 0) {
          sendResponse({ status: 'error', message: 'No highlights to export' });
          return;
        }

        try {
          const result = await exportToReadwise(state.highlights);

          // Reset state
          state.highlightModeActive = false;
          state.highlights = [];
          await saveState();
          await updateIcon(false);

          // Notify content script
          const tabId = message.tabId;
          if (tabId) {
            await sendToTab(tabId, { action: 'setHighlightMode', active: false });
            await sendToTab(tabId, { action: 'exportComplete' });
          }

          sendResponse({ status: 'exported', count: result.count });
        } catch (error) {
          sendResponse({ status: 'error', message: error.message });
        }
      })();
      return true; // Async response

    case 'cancelHighlightMode':
      (async () => {
        await loadState();
        state.highlightModeActive = false;
        state.highlights = [];
        await saveState();
        await updateIcon(false);
        const tabId = message.tabId || sender.tab?.id;
        if (tabId) {
          await sendToTab(tabId, { action: 'setHighlightMode', active: false });
        }
        sendResponse({ success: true });
      })();
      return true; // Async response

    default:
      return false;
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-highlight-mode') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && isValidLLMSite(tab.url)) {
      const result = await toggleHighlightMode(tab.id);

      // If exported, open popup to show link
      if (result.status === 'exported') {
        // Store result for popup to retrieve
        await chrome.storage.local.set({ lastExportResult: result });
      }
    }
  }
});

// Check if URL is a supported LLM site
function isValidLLMSite(url) {
  if (!url) return false;
  return url.includes('chat.openai.com') ||
         url.includes('chatgpt.com') ||
         url.includes('claude.ai') ||
         url.includes('gemini.google.com');
}

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('LLM Clipper installed');
});
