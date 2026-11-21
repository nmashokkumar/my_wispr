#!/usr/bin/env bash
# Standalone Client Launcher for Flow Desktop (Electron Background Daemon)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Launching Flow Desktop Background Daemon & Tray ==="
cd "$PROJECT_ROOT/flow_desktop"

if ! curl -s http://127.0.0.1:3000 > /dev/null 2>&1; then
    npm run dev > /dev/null 2>&1 &
    VITE_PID=$!
    sleep 1.5
    trap "kill $VITE_PID 2>/dev/null || true" EXIT INT TERM
fi

./node_modules/.bin/electron --no-sandbox electron/main.cjs
