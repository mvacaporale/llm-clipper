#!/usr/bin/env node
/**
 * Test script for the native messaging host
 * Simulates Chrome's native messaging protocol
 */

const { spawn } = require('child_process');
const path = require('path');

const hostPath = path.join(__dirname, 'obsidian-clipper-host.js');
const vaultPath = '/Users/michaelangelocaporale/Documents/Resources/Lodestone/3. Resources/LLM Clipper';

// Send a message using native messaging protocol
function sendMessage(process, message) {
  const messageJson = JSON.stringify(message);
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(messageJson.length, 0);
  process.stdin.write(lengthBuffer);
  process.stdin.write(messageJson);
}

// Read a response using native messaging protocol
function readResponse(stdout) {
  return new Promise((resolve, reject) => {
    let lengthBuffer = Buffer.alloc(0);
    let messageBuffer = Buffer.alloc(0);
    let expectedLength = null;

    const onData = (chunk) => {
      if (expectedLength === null) {
        lengthBuffer = Buffer.concat([lengthBuffer, chunk]);
        if (lengthBuffer.length >= 4) {
          expectedLength = lengthBuffer.readUInt32LE(0);
          messageBuffer = lengthBuffer.slice(4);
        }
      } else {
        messageBuffer = Buffer.concat([messageBuffer, chunk]);
      }

      if (expectedLength !== null && messageBuffer.length >= expectedLength) {
        stdout.removeListener('data', onData);
        try {
          const response = JSON.parse(messageBuffer.slice(0, expectedLength).toString('utf8'));
          resolve(response);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      }
    };

    stdout.on('data', onData);

    // Timeout after 5 seconds
    setTimeout(() => {
      stdout.removeListener('data', onData);
      reject(new Error('Timeout waiting for response'));
    }, 5000);
  });
}

async function runTest(testName, message) {
  console.log(`\n--- Test: ${testName} ---`);
  console.log('Request:', JSON.stringify(message, null, 2));

  const host = spawn('node', [hostPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  host.stderr.on('data', (data) => {
    console.error('Host stderr:', data.toString());
  });

  try {
    sendMessage(host, message);
    const response = await readResponse(host.stdout);
    console.log('Response:', JSON.stringify(response, null, 2));
    host.kill();
    return response;
  } catch (e) {
    console.error('Error:', e.message);
    host.kill();
    throw e;
  }
}

async function main() {
  console.log('Testing LLM Clipper Native Host\n');
  console.log('Vault path:', vaultPath);

  // Test 1: Ping
  await runTest('Ping', { action: 'ping' });

  // Test 2: Test connection
  await runTest('Test Connection', {
    action: 'testConnection',
    vaultPath: vaultPath
  });

  // Test 3: Create file
  const createResult = await runTest('Create File', {
    action: 'createFile',
    vaultPath: vaultPath,
    highlights: [
      { text: 'This is a test highlight from Claude.', url: 'https://claude.ai/chat/test', llm: 'Claude' },
      { text: 'Another highlight from the same conversation.', url: 'https://claude.ai/chat/test', llm: 'Claude' },
      { text: 'A highlight from ChatGPT.', url: 'https://chatgpt.com/c/test', llm: 'ChatGPT' }
    ],
    customTitle: 'Test Highlights'
  });

  // Test 4: List files
  await runTest('List Files', {
    action: 'listFiles',
    vaultPath: vaultPath
  });

  // Test 5: Search files
  await runTest('Search Files', {
    action: 'listFiles',
    vaultPath: vaultPath,
    query: 'test'
  });

  // Test 6: Append to file (if create succeeded)
  if (createResult && createResult.success && createResult.filePath) {
    await runTest('Append to File', {
      action: 'appendToFile',
      filePath: createResult.filePath,
      highlights: [
        { text: 'This is an appended highlight.', url: 'https://claude.ai/chat/test2', llm: 'Claude' }
      ]
    });
  }

  console.log('\n--- All tests completed ---');
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
