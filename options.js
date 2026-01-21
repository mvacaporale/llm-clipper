// LLM Clipper - Options Page Script

const form = document.getElementById('settingsForm');
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

// Test Notion connection
async function testConnection(apiKey, parentPageId) {
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
  const result = await chrome.storage.sync.get(['notionApiKey', 'notionParentPageId']);

  if (result.notionApiKey) {
    apiKeyInput.value = result.notionApiKey;
  }

  if (result.notionParentPageId) {
    parentPageIdInput.value = result.notionParentPageId;
  }
}

// Save settings
async function saveSettings(apiKey, parentPageId) {
  await chrome.storage.sync.set({
    notionApiKey: apiKey,
    notionParentPageId: parentPageId
  });
}

// Handle form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const apiKey = apiKeyInput.value.trim();
  const parentPageId = cleanPageId(parentPageIdInput.value);

  if (!apiKey) {
    showMessage('Please enter your Notion API key', 'error');
    return;
  }

  if (!parentPageId) {
    showMessage('Please enter a parent page ID', 'error');
    return;
  }

  // Update the cleaned page ID in the input
  parentPageIdInput.value = parentPageId;

  await saveSettings(apiKey, parentPageId);
  showMessage('Settings saved successfully!', 'success');
});

// Handle test button
testBtn.addEventListener('click', async () => {
  hideMessage();

  const apiKey = apiKeyInput.value.trim();
  const parentPageId = cleanPageId(parentPageIdInput.value);

  if (!apiKey || !parentPageId) {
    showMessage('Please enter both API key and page ID first', 'error');
    return;
  }

  testBtn.textContent = 'Testing...';
  testBtn.disabled = true;

  const result = await testConnection(apiKey, parentPageId);

  testBtn.textContent = 'Test Connection';
  testBtn.disabled = false;

  if (result.success) {
    showMessage(`Connected successfully! Page: "${result.pageTitle}"`, 'success');
  } else {
    showMessage(`Connection failed: ${result.error}`, 'error');
  }
});

// Load settings on page load
loadSettings();
