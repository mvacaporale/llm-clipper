// LLM Clipper - Content Script
// Handles text selection detection on LLM sites (non-destructive approach)

let isHighlightModeActive = false;
let highlightRanges = [];
let clipperHighlight = null;

// Initialize CSS Custom Highlight API if available
function initHighlightAPI() {
  try {
    if (typeof CSS !== 'undefined' && CSS.highlights && !clipperHighlight) {
      clipperHighlight = new Highlight();
      CSS.highlights.set('llm-clipper', clipperHighlight);
    }
  } catch (e) {
    console.log('CSS Highlight API not available');
  }
}

// Add a range to the persistent highlights
function addHighlightRange(range) {
  try {
    if (clipperHighlight) {
      const clonedRange = range.cloneRange();
      highlightRanges.push(clonedRange);
      clipperHighlight.add(clonedRange);
    }
  } catch (e) {
    // Ignore errors from invalid ranges
  }
}

// Clear all persistent highlights
function clearAllHighlights() {
  try {
    if (clipperHighlight) {
      clipperHighlight.clear();
    }
  } catch (e) {
    // Ignore
  }
  highlightRanges = [];
  hideFloatingDelete();
}

// Remove a specific highlight by index
function removeHighlight(index) {
  // Remove from CSS Highlight API
  if (clipperHighlight && highlightRanges[index]) {
    try {
      clipperHighlight.delete(highlightRanges[index]);
    } catch (e) {
      // Ignore
    }
  }

  // Remove from local array
  highlightRanges.splice(index, 1);

  // Tell background to remove it
  chrome.runtime.sendMessage({
    action: 'removeHighlight',
    index: index
  }, (response) => {
    if (chrome.runtime.lastError) return;
  });
}

// Check if rangeA completely contains rangeB
function rangeContains(rangeA, rangeB) {
  try {
    // rangeA starts before or at rangeB's start
    const startComparison = rangeA.compareBoundaryPoints(Range.START_TO_START, rangeB);
    // rangeA ends after or at rangeB's end
    const endComparison = rangeA.compareBoundaryPoints(Range.END_TO_END, rangeB);
    return startComparison <= 0 && endComparison >= 0;
  } catch (e) {
    return false;
  }
}

// Find indices of highlights that are contained within the given range
function findContainedHighlights(newRange) {
  const containedIndices = [];
  for (let i = 0; i < highlightRanges.length; i++) {
    try {
      if (rangeContains(newRange, highlightRanges[i])) {
        containedIndices.push(i);
      }
    } catch (e) {
      // Range might be invalid
    }
  }
  return containedIndices;
}

// Remove multiple highlights by indices (in reverse order to maintain indices)
function removeHighlights(indices) {
  // Sort in descending order so we remove from end first
  indices.sort((a, b) => b - a);

  for (const index of indices) {
    // Remove from CSS Highlight API
    if (clipperHighlight && highlightRanges[index]) {
      try {
        clipperHighlight.delete(highlightRanges[index]);
      } catch (e) {
        // Ignore
      }
    }
    // Remove from local array
    highlightRanges.splice(index, 1);
  }

  // Tell background to remove them
  chrome.runtime.sendMessage({
    action: 'removeHighlights',
    indices: indices
  }, (response) => {
    if (chrome.runtime.lastError) return;
  });
}


// Floating delete button for highlights
let floatingDeleteBtn = null;
let currentHoverIndex = -1;
let isOverDeleteBtn = false;

function createFloatingDeleteBtn() {
  if (floatingDeleteBtn) return;

  floatingDeleteBtn = document.createElement('button');
  floatingDeleteBtn.className = 'llm-clipper-floating-delete';
  floatingDeleteBtn.innerHTML = '✕';
  floatingDeleteBtn.style.display = 'none';
  document.body.appendChild(floatingDeleteBtn);

  floatingDeleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentHoverIndex >= 0) {
      removeHighlight(currentHoverIndex);
      hideFloatingDelete();
    }
  });

  // Keep button visible when hovering over it
  floatingDeleteBtn.addEventListener('mouseenter', () => {
    isOverDeleteBtn = true;
  });

  floatingDeleteBtn.addEventListener('mouseleave', () => {
    isOverDeleteBtn = false;
    hideFloatingDelete();
  });
}

function showFloatingDelete(x, y, index) {
  if (!floatingDeleteBtn) createFloatingDeleteBtn();

  currentHoverIndex = index;
  floatingDeleteBtn.style.display = 'flex';
  floatingDeleteBtn.style.left = `${x}px`;
  floatingDeleteBtn.style.top = `${y}px`;
}

function hideFloatingDelete() {
  if (isOverDeleteBtn) return; // Don't hide if mouse is over the button
  if (floatingDeleteBtn) {
    floatingDeleteBtn.style.display = 'none';
  }
  currentHoverIndex = -1;
}

// Check if a point is within a range
function isPointInRange(x, y, range) {
  const rects = range.getClientRects();
  for (const rect of rects) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return true;
    }
  }
  return false;
}

// Find which highlight the mouse is over
function getHighlightAtPoint(x, y) {
  for (let i = 0; i < highlightRanges.length; i++) {
    try {
      if (isPointInRange(x, y, highlightRanges[i])) {
        return { index: i, range: highlightRanges[i] };
      }
    } catch (e) {
      // Range might be invalid
    }
  }
  return null;
}

// Handle mouse movement to show/hide delete button
let hoverTimeout = null;

function handleMouseMove(e) {
  if (!isHighlightModeActive || highlightRanges.length === 0) {
    if (!isOverDeleteBtn) hideFloatingDelete();
    return;
  }

  // Don't process if we're over the delete button
  if (isOverDeleteBtn) return;

  // Debounce for performance
  if (hoverTimeout) clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    const highlight = getHighlightAtPoint(e.clientX, e.clientY);

    if (highlight) {
      // Get the last rect of the range to position the button
      const rects = highlight.range.getClientRects();
      if (rects.length > 0) {
        const lastRect = rects[rects.length - 1];
        showFloatingDelete(
          lastRect.right + window.scrollX + 4,
          lastRect.top + window.scrollY - 4,
          highlight.index
        );
      }
    } else {
      hideFloatingDelete();
    }
  }, 50);
}

document.addEventListener('mousemove', handleMouseMove);

// Detect which LLM based on hostname
function detectLLM() {
  const hostname = window.location.hostname;
  if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
    return 'ChatGPT';
  } else if (hostname.includes('claude.ai')) {
    return 'Claude';
  } else if (hostname.includes('gemini.google.com')) {
    return 'Gemini';
  }
  return 'Unknown';
}

// Show toast notification
function showToast(message, duration = 2000, showUndo = false, highlightIndex = -1) {
  const existingToast = document.querySelector('.llm-clipper-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'llm-clipper-toast';

  let html = `
    <span class="llm-clipper-toast-icon"></span>
    <span class="llm-clipper-toast-text">${message}</span>
  `;

  if (showUndo && highlightIndex >= 0) {
    html += `<button class="llm-clipper-undo-btn" data-index="${highlightIndex}">✕</button>`;
  }

  toast.innerHTML = html;
  document.body.appendChild(toast);

  // Handle undo button click
  const undoBtn = toast.querySelector('.llm-clipper-undo-btn');
  if (undoBtn) {
    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(undoBtn.dataset.index);
      removeHighlight(index);
      toast.remove();
    });
  }

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, duration);
}

// Update highlight count (badge removed - using floating X instead)
function updateModeBadge(highlightCount) {
  // No-op - keeping function for compatibility with message handlers
}

// Get selected text and range without modifying DOM
function getSelectedTextAndRange() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    return null;
  }
  return {
    text: selection.toString().trim(),
    range: selection.getRangeAt(0)
  };
}

// Handle text selection when highlight mode is active
function handleSelection() {
  if (!isHighlightModeActive) return;

  const sel = getSelectedTextAndRange();
  if (sel) {
    // Check if new highlight contains any existing highlights
    const containedIndices = findContainedHighlights(sel.range);

    // Remove contained highlights first
    if (containedIndices.length > 0) {
      removeHighlights(containedIndices);
    }

    // Add visual highlight using CSS Custom Highlight API
    addHighlightRange(sel.range);

    // Send highlight to background script for storage (include source info)
    chrome.runtime.sendMessage({
      action: 'addHighlight',
      text: sel.text,
      url: window.location.href,
      llm: detectLLM()
    }, (response) => {
      if (chrome.runtime.lastError) return;
    });

    // Clear selection after capturing
    window.getSelection().removeAllRanges();
  }
}

// Listen for mouseup events to capture text selection
document.addEventListener('mouseup', () => {
  setTimeout(handleSelection, 10);
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'setHighlightMode':
      isHighlightModeActive = message.active;
      document.body.classList.toggle('llm-clipper-active', isHighlightModeActive);

      if (isHighlightModeActive) {
        initHighlightAPI();
        updateModeBadge(0);
        showToast('Highlight mode ON - Select text to capture');
      } else {
        clearAllHighlights();
        updateModeBadge(0);
      }
      sendResponse({ success: true });
      return false;

    case 'getPageInfo':
      sendResponse({
        llm: detectLLM(),
        url: window.location.href
      });
      return false;

    case 'getHighlightMode':
      sendResponse({ active: isHighlightModeActive });
      return false;

    case 'exportComplete':
      showToast('Exported to Notion!', 3000);
      return false;

    case 'showMessage':
      showToast(message.text, message.duration || 2000);
      return false;

    default:
      return false;
  }
});

// Check and sync highlight mode state
function syncHighlightState() {
  if (!chrome.runtime?.id) return;

  chrome.runtime.sendMessage({ action: 'getHighlightMode' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    if (response.active && !isHighlightModeActive) {
      // Background says active but we're not - activate
      isHighlightModeActive = true;
      initHighlightAPI();
      document.body.classList.add('llm-clipper-active');
    } else if (!response.active && isHighlightModeActive) {
      // Background says inactive but we are - deactivate
      isHighlightModeActive = false;
      document.body.classList.remove('llm-clipper-active');
      clearAllHighlights();
    }
  });
}

// Initialize: check if highlight mode was already active (with error handling)
setTimeout(syncHighlightState, 100);

// Re-sync state when tab becomes visible (for cross-tab highlighting)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncHighlightState();
  }
});

// Check for pending LLM content to paste (for "Read with LLM" feature)
async function checkPendingContent() {
  try {
    const result = await chrome.storage.local.get('pendingLLMContent');
    const pending = result.pendingLLMContent;

    if (!pending || !pending.prompt) return;

    // Check if content is recent (within 30 seconds)
    if (Date.now() - pending.timestamp > 30000) {
      await chrome.storage.local.remove('pendingLLMContent');
      return;
    }

    // Clear the pending content immediately to prevent duplicate pastes
    await chrome.storage.local.remove('pendingLLMContent');

    // Wait for the page to fully load and input to be available
    await waitForInput();

    // Paste the content
    await pasteContent(pending.prompt);
  } catch (error) {
    console.error('LLM Clipper: Error checking pending content', error);
  }
}

// Wait for the input field to be available
function waitForInput() {
  return new Promise((resolve) => {
    const maxAttempts = 50;
    let attempts = 0;

    const check = () => {
      attempts++;
      const input = findInputField();
      if (input || attempts >= maxAttempts) {
        resolve(input);
      } else {
        setTimeout(check, 200);
      }
    };

    check();
  });
}

// Find the input field based on which LLM site we're on
function findInputField() {
  const hostname = window.location.hostname;

  if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
    // ChatGPT uses a textarea or contenteditable div
    return document.querySelector('#prompt-textarea') ||
           document.querySelector('textarea[data-id="root"]') ||
           document.querySelector('div[contenteditable="true"]');
  } else if (hostname.includes('claude.ai')) {
    // Claude uses a contenteditable div
    return document.querySelector('div[contenteditable="true"].ProseMirror') ||
           document.querySelector('div[contenteditable="true"]');
  } else if (hostname.includes('gemini.google.com')) {
    // Gemini uses a rich text input
    return document.querySelector('.ql-editor') ||
           document.querySelector('div[contenteditable="true"]') ||
           document.querySelector('rich-textarea textarea');
  }

  return null;
}

// Paste content into the input field
async function pasteContent(text) {
  const input = findInputField();
  if (!input) {
    console.log('LLM Clipper: Input field not found');
    return;
  }

  // Focus the input
  input.focus();

  // Different handling based on input type
  if (input.tagName === 'TEXTAREA') {
    // For textarea elements
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (input.contentEditable === 'true') {
    // For contenteditable divs
    // Use execCommand for better compatibility
    document.execCommand('insertText', false, text);

    // Also try setting innerText as fallback
    if (!input.innerText.trim()) {
      input.innerText = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Show a toast to indicate content was pasted
  showToast('Article content pasted. Press Enter to send.', 3000);
}

// Check for pending content when page loads
setTimeout(checkPendingContent, 1500);
