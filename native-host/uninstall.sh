#!/bin/bash
# LLM Clipper - Native Host Uninstaller for macOS

set -e

HOST_NAME="com.llmclipper.obsidian"

echo "Uninstalling LLM Clipper Native Host..."

# Remove from all browser locations
rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json" 2>/dev/null || true
rm -f "$HOME/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json" 2>/dev/null || true
rm -f "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/$HOST_NAME.json" 2>/dev/null || true
rm -f "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$HOST_NAME.json" 2>/dev/null || true
rm -f "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts/$HOST_NAME.json" 2>/dev/null || true

echo "Uninstallation complete!"
