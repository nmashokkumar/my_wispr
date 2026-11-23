#!/usr/bin/env bash
# Standalone Client Launcher for My Wispr (Electron Background Daemon)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Launching My Wispr Background Daemon & Tray ==="
cd "$PROJECT_ROOT/my_wispr"

if ! curl -s http://127.0.0.1:3000 > /dev/null 2>&1; then
    npm run dev > /dev/null 2>&1 &
    VITE_PID=$!
    sleep 1.5
    trap "kill $VITE_PID 2>/dev/null || true" EXIT INT TERM
fi

./node_modules/.bin/electron --no-sandbox electron/main.cjs
