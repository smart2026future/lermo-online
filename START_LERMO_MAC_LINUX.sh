#!/bin/bash

clear
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         🌸  LERMO — Secure Chat Platform  🌸         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  ❌  Node.js is not installed!"
    echo ""
    echo "  Please install Node.js from: https://nodejs.org"
    echo "  (Choose the LTS version)"
    echo ""
    exit 1
fi

echo "  ✅  Node.js $(node --version) found!"
echo ""

cd "$(dirname "$0")/backend"

echo "  📦  Installing dependencies..."
npm install --silent 2>/dev/null
echo "  ✅  Dependencies ready!"
echo ""

# Get local IP
if [[ "$OSTYPE" == "darwin"* ]]; then
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
else
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
fi

echo "  ══════════════════════════════════════════════════"
echo ""
echo "  🌐  Your LERMO server address:"
echo ""
echo "       http://${LOCAL_IP}:8888"
echo ""
echo "  Share this address with everyone on the same Wi-Fi."
echo "  Works on: iPhone, iPad, Android, Mac, Windows, Linux"
echo ""
echo "  👤  Admin account: use your configured administrator credentials"
echo ""
echo "  ══════════════════════════════════════════════════"
echo ""
echo "  🚀  Starting server... (do NOT close this window)"
echo ""

node server.js
