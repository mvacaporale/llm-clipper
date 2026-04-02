// LLM Clipper - Options Page Script

const form = document.getElementById('settingsForm');
const readwiseTokenInput = document.getElementById('readwiseToken');
const apiKeyInput = document.getElementById('notionApiKey');
const parentPageIdInput = document.getElementById('notionParentPageId');
const messageDiv = document.getElementById('message');
const testBtn = document.getElementById('testBtn');

// Show message
function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.classList.remove('hidden');

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      messageDiv.classList.add('hidden');
    }, 3000);
  }
}

// Hide message
function hideMessage() {
  messageDiv.classList.add('hidden');
}

// Clean page ID (remove dashes and extract ID from URL if needed)
function cleanPageId(input) {
  // If it's a full URL, extract the ID
  if (input.includes('notion.so') || input.includes('notion.site')) {
    // Extract the ID from URL (last 32 chars before any query string)
    const match = input.match(/([a-f0-9]{32})/i);
    if (match) {
      return match[1];
    }
    // Try to find ID with dashes
    const dashMatch = input.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    if (dashMatch) {
      return dashMatch[1].replace(/-/g, '');
    }
  }

  // Remove dashes if present
  return input.replace(/-/g, '').trim();
}

// Test Readwise connection
async function testReadwiseConnection(token) {
  try {
    const response = await fetch('https://readwise.io/api/v2/auth/', {
      method: 'GET',
      headers: {
        'Authorization': `Token ${token}`
      }
    });

    if (response.status === 204) {
      return { success: true };
    } else {
      return { success: false, error: 'Invalid token' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Test Notion connection
async function testNotionConnection(apiKey, parentPageId) {
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${parentPageId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (response.ok) {
      const page = await response.json();
      return { success: true, pageTitle: page.properties?.title?.title?.[0]?.plain_text || 'Untitled' };
    } else {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to connect' };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Load saved settings
async function loadSettings() {
  const result = await chrome.storage.sync.get(['readwiseToken', 'notionApiKey', 'notionParentPageId']);

  if (result.readwiseToken) {
    readwiseTokenInput.value = result.readwiseToken;
  }

  if (result.notionApiKey) {
    apiKeyInput.value = result.notionApiKey;
  }

  if (result.notionParentPageId) {
    parentPageIdInput.value = result.notionParentPageId;
  }
}

// Save settings
async function saveSettings(readwiseToken, apiKey, parentPageId) {
  await chrome.storage.sync.set({
    readwiseToken: readwiseToken,
    notionApiKey: apiKey,
    notionParentPageId: parentPageId
  });
}

// Handle form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const readwiseToken = readwiseTokenInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const parentPageId = cleanPageId(parentPageIdInput.value);

  // Need at least one service configured
  if (!readwiseToken && !apiKey) {
    showMessage('Please configure at least Readwise or Notion', 'error');
    return;
  }

  // If Notion is partially configured, require both fields
  if ((apiKey && !parentPageId) || (!apiKey && parentPageId)) {
    showMessage('Notion requires both API key and parent page ID', 'error');
    return;
  }

  // Update the cleaned page ID in the input
  if (parentPageId) {
    parentPageIdInput.value = parentPageId;
  }

  await saveSettings(readwiseToken, apiKey, parentPageId);
  showMessage('Settings saved successfully!', 'success');
});

// Handle test button
testBtn.addEventListener('click', async () => {
  hideMessage();

  const readwiseToken = readwiseTokenInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const parentPageId = cleanPageId(parentPageIdInput.value);

  if (!readwiseToken && !apiKey) {
    showMessage('Please enter at least one service token first', 'error');
    return;
  }

  testBtn.textContent = 'Testing...';
  testBtn.disabled = true;

  const results = [];

  // Test Readwise if configured
  if (readwiseToken) {
    const rwResult = await testReadwiseConnection(readwiseToken);
    if (rwResult.success) {
      results.push('Readwise: Connected');
    } else {
      results.push(`Readwise: ${rwResult.error}`);
    }
  }

  // Test Notion if configured
  if (apiKey && parentPageId) {
    const notionResult = await testNotionConnection(apiKey, parentPageId);
    if (notionResult.success) {
      results.push(`Notion: Connected to "${notionResult.pageTitle}"`);
    } else {
      results.push(`Notion: ${notionResult.error}`);
    }
  }

  testBtn.textContent = 'Test Connection';
  testBtn.disabled = false;

  const allSuccess = results.every(r => r.includes('Connected'));
  showMessage(results.join(' | '), allSuccess ? 'success' : 'error');
});

// Load settings on page load
loadSettings();
