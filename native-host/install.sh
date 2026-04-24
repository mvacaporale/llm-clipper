#!/bin/bash
# LLM Clipper - Native Host Installer for macOS
#
# This script installs the native messaging host for Chrome/Chromium browsers.
# Run with: ./install.sh <extension-id>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script lives
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
HOST_NAME="com.llmclipper.obsidian"
HOST_SCRIPT="$SCRIPT_DIR/obsidian-clipper-host.js"

# Check for extension ID argument
if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: ./install.sh <extension-id>${NC}"
    echo ""
    echo "To find your extension ID:"
    echo "  1. Open Chrome and go to chrome://extensions/"
    echo "  2. Enable 'Developer mode' (top right)"
    echo "  3. Find 'LLM Clipper' and copy its ID"
    echo ""
    echo "Example: ./install.sh abcdefghijklmnopqrstuvwxyz123456"
    exit 1
fi

EXTENSION_ID="$1"

echo -e "${GREEN}Installing LLM Clipper Native Host...${NC}"
echo ""

# Check Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is required but not installed.${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}Warning: Node.js 18+ recommended. You have $(node -v)${NC}"
fi

# Make host script executable
chmod +x "$HOST_SCRIPT"
echo "Made host script executable"

# Create manifest with actual paths and extension ID
MANIFEST_CONTENT=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "LLM Clipper Obsidian Native Host - writes highlights to Obsidian vault",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
)

# Determine Chrome native messaging hosts directory
# macOS locations for different browsers
CHROME_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
CHROMIUM_HOST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
BRAVE_HOST_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
EDGE_HOST_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
ARC_HOST_DIR="$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"

# Install for Chrome (and create directory if needed)
install_for_browser() {
    local browser_name="$1"
    local host_dir="$2"

    if [ -d "$(dirname "$host_dir")" ]; then
        mkdir -p "$host_dir"
        echo "$MANIFEST_CONTENT" > "$host_dir/$HOST_NAME.json"
        echo -e "  ${GREEN}Installed for $browser_name${NC}"
    fi
}

echo ""
echo "Installing native host manifest..."

install_for_browser "Chrome" "$CHROME_HOST_DIR"
install_for_browser "Chromium" "$CHROMIUM_HOST_DIR"
install_for_browser "Brave" "$BRAVE_HOST_DIR"
install_for_browser "Edge" "$EDGE_HOST_DIR"
install_for_browser "Arc" "$ARC_HOST_DIR"

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Reload the LLM Clipper extension in Chrome"
echo "  2. Open extension options and configure Obsidian vault path"
echo "  3. Test the connection"
echo ""
echo "Vault path to use:"
echo "  /Users/michaelangelocaporale/Documents/Resources/Lodestone/3. Resources/LLM Clipper"
