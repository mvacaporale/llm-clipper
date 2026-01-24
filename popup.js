// LLM Clipper - Popup Script

const contentDiv = document.getElementById('content');

const SUPPORTED_SITES = [
  'chat.openai.com',
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com'
];

const LLM_URLS = {
  gemini: 'https://gemini.google.com/app',
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/'
};

function isSupported(url) {
  if (!url) return false;
  return SUPPORTED_SITES.some(site => url.includes(site));
}

function renderExported(notionUrl) {
  contentDiv.innerHTML = `
    <a href="${notionUrl}" target="_blank" class="notion-link">Open in Notion</a>
  `;
}

function renderError(message) {
  contentDiv.innerHTML = `<div class="error">${message}</div>`;
}

// Debounce helper
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// State for page selection
let selectedPage = null; // { id, title, icon } or null for new page

async function renderExportUI(highlightCount, tab) {
  selectedPage = null; // Reset selection

  contentDiv.innerHTML = `
    <div class="export-ui">
      <div class="highlight-count"><strong>${highlightCount}</strong> highlight${highlightCount !== 1 ? 's' : ''} ready</div>
      <div class="page-search-section">
        <label>Save to</label>
        <div id="selectionDisplay"></div>
        <input type="text" class="page-search-input" placeholder="Search pages or create new..." id="pageSearchInput">
        <div class="page-results" id="pageResults"></div>
      </div>
      <div class="new-page-section" id="newPageSection">
        <label>Page name</label>
        <input type="text" class="page-name-input" placeholder="Optional - uses default if empty" id="pageNameInput">
      </div>
      <div class="export-buttons">
        <button class="export-btn cancel" id="cancelBtn">Cancel</button>
        <button class="export-btn save" id="saveBtn">Save</button>
      </div>
    </div>
  `;

  const pageSearchInput = document.getElementById('pageSearchInput');
  const pageResults = document.getElementById('pageResults');
  const selectionDisplay = document.getElementById('selectionDisplay');
  const newPageSection = document.getElementById('newPageSection');
  const pageNameInput = document.getElementById('pageNameInput');
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  // Update the selection display
  function updateSelectionDisplay() {
    if (selectedPage) {
      const icon = selectedPage.icon || '📄';
      selectionDisplay.innerHTML = `
        <div class="selected-page">
          <span class="page-icon">${icon}</span>
          <span class="page-title">${selectedPage.title}</span>
          <button class="clear-btn" id="clearSelection">✕</button>
        </div>
      `;
      pageSearchInput.style.display = 'none';
      pageResults.innerHTML = '';
      newPageSection.classList.add('hidden');

      document.getElementById('clearSelection').addEventListener('click', () => {
        selectedPage = null;
        updateSelectionDisplay();
      });
    } else {
      selectionDisplay.innerHTML = '';
      pageSearchInput.style.display = 'block';
      newPageSection.classList.remove('hidden');
      pageSearchInput.focus();
    }
  }

  // Search and display results
  async function searchPages(query) {
    pageResults.innerHTML = '<div class="searching-indicator">Searching...</div>';

    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'searchPages', query }, resolve);
    });

    const pages = response?.pages || [];

    let html = `
      <div class="page-result-item new-page" data-id="new">
        <span class="page-icon">➕</span>
        <span class="page-title">Create new page${query ? `: "${query}"` : ''}</span>
      </div>
    `;

    pages.forEach(page => {
      const icon = page.icon || '📄';
      html += `
        <div class="page-result-item" data-id="${page.id}" data-title="${page.title.replace(/"/g, '&quot;')}" data-icon="${icon}">
          <span class="page-icon">${icon}</span>
          <span class="page-title">${page.title}</span>
        </div>
      `;
    });

    pageResults.innerHTML = html;

    // Add click handlers
    pageResults.querySelectorAll('.page-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (id === 'new') {
          selectedPage = null;
          if (query) {
            pageNameInput.value = query;
          }
        } else {
          selectedPage = {
            id: id,
            title: item.dataset.title,
            icon: item.dataset.icon
          };
        }
        updateSelectionDisplay();
      });
    });
  }

  // Debounced search
  const debouncedSearch = debounce(searchPages, 300);

  // Initial search to show recent pages
  searchPages('');

  // Handle search input
  pageSearchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });

  // Handle Enter in search to create new page with that name
  pageSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = pageSearchInput.value.trim();
      selectedPage = null;
      if (query) {
        pageNameInput.value = query;
      }
      updateSelectionDisplay();
    }
  });

  // Handle Enter in page name input
  pageNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      doExport();
    }
  });

  function doExport() {
    if (selectedPage) {
      handleExport(tab, null, selectedPage.id);
    } else {
      handleExport(tab, pageNameInput.value.trim(), 'new');
    }
  }

  saveBtn.addEventListener('click', doExport);

  cancelBtn.addEventListener('click', () => {
    handleCancel(tab);
  });

  // Initial display
  updateSelectionDisplay();
}

async function handleExport(tab, pageName, targetPageId) {
  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  // Disable buttons and show loading
  saveBtn.disabled = true;
  cancelBtn.disabled = true;
  saveBtn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;"></div>';

  const messageData = {
    action: 'toggleHighlightMode',
    tabId: tab.id
  };

  if (targetPageId === 'new') {
    // Creating new page
    messageData.pageTitle = pageName || null;
  } else {
    // Appending to existing page
    messageData.existingPageId = targetPageId;
  }

  const result = await new Promise(resolve => {
    chrome.runtime.sendMessage(messageData, resolve);
  });

  if (result?.status === 'exported') {
    renderExported(result.notionUrl);
  } else if (result?.status === 'error') {
    renderError(result.message);
  }
}

async function handleCancel(tab) {
  await new Promise(resolve => {
    chrome.runtime.sendMessage({
      action: 'cancelHighlightMode',
      tabId: tab.id
    }, resolve);
  });
  window.close();
}

function renderStatus(text) {
  contentDiv.innerHTML = `<div class="status">${text}</div>`;
}

function renderLoading() {
  contentDiv.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
}

function renderReadWithLLM(tab) {
  contentDiv.innerHTML = `
    <div class="read-with-llm">
      <h3>Read this with an LLM?</h3>
      <div class="llm-buttons">
        <button class="llm-btn gemini" data-llm="gemini">Gemini</button>
        <button class="llm-btn claude" data-llm="claude">Claude</button>
        <button class="llm-btn chatgpt" data-llm="chatgpt">ChatGPT</button>
      </div>
    </div>
  `;

  // Add click handlers
  const buttons = contentDiv.querySelectorAll('.llm-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => handleLLMSelect(btn.dataset.llm, tab));
  });
}

// Check if URL is a YouTube video
function isYouTubeVideo(url) {
  return url && (
    url.includes('youtube.com/watch') ||
    url.includes('youtu.be/')
  );
}

// Extract YouTube transcript from page
async function extractYouTubeTranscript(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: async () => {
        const title = document.title || '';
        const url = window.location.href;

        // Try to find caption tracks in the page data
        try {
          // YouTube embeds player data in ytInitialPlayerResponse
          const scripts = document.querySelectorAll('script');
          let playerResponse = null;

          for (const script of scripts) {
            const text = script.textContent;
            if (text && text.includes('ytInitialPlayerResponse')) {
              const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
              if (match) {
                playerResponse = JSON.parse(match[1]);
                break;
              }
            }
          }

          // Also try window object
          if (!playerResponse && window.ytInitialPlayerResponse) {
            playerResponse = window.ytInitialPlayerResponse;
          }

          if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
            const tracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;

            // Prefer English, fall back to first available
            let track = tracks.find(t => t.languageCode === 'en') || tracks[0];

            if (track?.baseUrl) {
              // Fetch the transcript
              const response = await fetch(track.baseUrl + '&fmt=json3');
              const data = await response.json();

              if (data.events) {
                // Extract text from transcript events
                const transcript = data.events
                  .filter(e => e.segs)
                  .map(e => e.segs.map(s => s.utf8).join(''))
                  .join(' ')
                  .replace(/\s+/g, ' ')
                  .trim();

                if (transcript) {
                  return {
                    title,
                    content: transcript,
                    url,
                    isYouTube: true,
                    hasTranscript: true
                  };
                }
              }
            }
          }
        } catch (e) {
          console.log('Failed to extract YouTube transcript:', e);
        }

        // Fallback: return video description and metadata
        const description = document.querySelector('#description-inline-expander')?.innerText ||
                          document.querySelector('#description')?.innerText ||
                          '';

        return {
          title,
          content: description || '[No transcript available - video description only]',
          url,
          isYouTube: true,
          hasTranscript: false
        };
      }
    });

    return results[0]?.result || null;
  } catch (error) {
    console.error('Failed to extract YouTube content:', error);
    return null;
  }
}

async function extractPageContent(tabId, url) {
  // Check if it's a YouTube video
  if (isYouTubeVideo(url)) {
    return await extractYouTubeTranscript(tabId);
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Extract page title
        const title = document.title || '';

        // Try to get article content first
        let content = '';

        // Look for common article containers
        const articleSelectors = [
          'article',
          '[role="article"]',
          '.article-content',
          '.post-content',
          '.entry-content',
          'main',
          '.content'
        ];

        for (const selector of articleSelectors) {
          const el = document.querySelector(selector);
          if (el && el.innerText.trim().length > 200) {
            content = el.innerText.trim();
            break;
          }
        }

        // Fallback to body text if no article found
        if (!content) {
          content = document.body.innerText.trim();
        }

        // Limit content length (LLMs have context limits)
        const maxLength = 15000;
        if (content.length > maxLength) {
          content = content.substring(0, maxLength) + '...\n\n[Content truncated]';
        }

        return { title, content, url: window.location.href };
      }
    });

    return results[0]?.result || null;
  } catch (error) {
    console.error('Failed to extract content:', error);
    return null;
  }
}

async function handleLLMSelect(llm, tab) {
  // Disable all buttons and show loading
  const buttons = contentDiv.querySelectorAll('.llm-btn');
  buttons.forEach(btn => btn.disabled = true);

  const selectedBtn = contentDiv.querySelector(`[data-llm="${llm}"]`);
  if (selectedBtn) {
    selectedBtn.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;"></div>';
  }

  // Extract page content (pass URL for YouTube detection)
  const pageData = await extractPageContent(tab.id, tab.url);

  if (!pageData) {
    renderError('Failed to extract page content');
    return;
  }

  // Build the prompt based on content type
  let prompt;

  if (pageData.isYouTube) {
    if (pageData.hasTranscript) {
      prompt = `Please read and analyze this YouTube video transcript, then be ready to answer my questions about it.

Title: ${pageData.title}
URL: ${pageData.url}

---
TRANSCRIPT:
${pageData.content}
---

I've shared this video transcript with you. Please confirm you've read it and let me know you're ready for my questions.`;
    } else {
      prompt = `I wanted to share a YouTube video with you, but I couldn't extract the transcript.

Title: ${pageData.title}
URL: ${pageData.url}

Video Description:
${pageData.content}

Unfortunately, this video doesn't have an available transcript. You can see the description above. Let me know if you'd like me to describe what the video is about, or if you have any questions based on the description.`;
    }
  } else {
    prompt = `Please read and analyze this article, then be ready to answer my questions about it.

Title: ${pageData.title}
URL: ${pageData.url}

---
${pageData.content}
---

I've shared this article with you. Please confirm you've read it and let me know you're ready for my questions.`;
  }

  // Store content for the LLM page to retrieve
  await chrome.storage.local.set({
    pendingLLMContent: {
      prompt: prompt,
      llm: llm,
      timestamp: Date.now()
    }
  });

  // Open the LLM in a new tab
  const llmUrl = LLM_URLS[llm];
  chrome.tabs.create({ url: llmUrl });

  window.close();
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!isSupported(tab.url)) {
    // Non-LLM page - show "Read with LLM" UI
    renderReadWithLLM(tab);
    return;
  }

  const configResponse = await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'checkConfig' }, resolve);
  });

  if (!configResponse?.configured) {
    renderStatus('Configure in settings');
    setTimeout(() => chrome.runtime.openOptionsPage(), 800);
    return;
  }

  const stateResponse = await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getState' }, resolve);
  });

  if (stateResponse?.active && stateResponse?.highlightCount > 0) {
    // Has highlights - show export UI with page selector
    await renderExportUI(stateResponse.highlightCount, tab);
  } else if (stateResponse?.active) {
    // Active but no highlights
    renderStatus('No highlights yet');
  } else {
    // Not active - activate and close immediately
    chrome.runtime.sendMessage({ action: 'toggleHighlightMode', tabId: tab.id });
    window.close();
  }
}

init();
