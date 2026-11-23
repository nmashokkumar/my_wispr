#!/usr/bin/env bash
# One-Command Launcher for Wispr Flow (Flow Desktop Background Daemon + Local Private ASR Server)
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "   Starting Wispr Flow Linux Environment  "
echo "========================================="

SERVER_STARTED=0
VITE_STARTED=0

# 1. Start Server Backend if not already running on port 8000
if ! curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo "[1/3] Starting local private ASR server on http://127.0.0.1:8000..."
    "$PROJECT_ROOT/server/.venv/bin/uvicorn" src.main:app --app-dir "$PROJECT_ROOT/server" --host 127.0.0.1 --port 8000 > "$PROJECT_ROOT/server.log" 2>&1 &
    SERVER_PID=$!
    SERVER_STARTED=1
    echo "      Server process launched (PID: $SERVER_PID)"

    # Wait for server to become healthy
    echo -n "      Waiting for server to become ready..."
    MAX_RETRIES=20
    COUNT=0
    until curl -s http://127.0.0.1:8000/health > /dev/null 2>&1 || [ $COUNT -ge $MAX_RETRIES ]; do
        sleep 0.5
        echo -n "."
        COUNT=$((COUNT+1))
    done
    echo ""

    if curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
        echo "      ✓ Backend server is LIVE and healthy on http://127.0.0.1:8000"
    else
        echo "      ✗ Server failed to start within 10 seconds. Check server.log:"
        cat "$PROJECT_ROOT/server.log"
        exit 1
    fi
else
    echo "[1/3] ✓ Backend server already running and healthy on http://127.0.0.1:8000"
fi

# Cleanup function on script exit
cleanup() {
    echo ""
    if [ $VITE_STARTED -eq 1 ] && [ -n "$VITE_PID" ]; then
        echo "Shutting down Vite dev server (PID: $VITE_PID)..."
        kill "$VITE_PID" 2>/dev/null || true
    fi
    if [ $SERVER_STARTED -eq 1 ] && [ -n "$SERVER_PID" ]; then
        echo "Shutting down local ASR server (PID: $SERVER_PID)..."
        kill "$SERVER_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 2. Ensure frontend bundle is built & start Vite dev server
cd "$PROJECT_ROOT/my_wispr"
if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "[2/3] Building local frontend bundle..."
    npm run build
fi

if ! curl -s http://127.0.0.1:3000 > /dev/null 2>&1; then
    echo "[2/3] Launching Vite UI server on http://localhost:3000..."
    npm run dev > /dev/null 2>&1 &
    VITE_PID=$!
    VITE_STARTED=1

    echo -n "      Waiting for UI server to be ready..."
    MAX_VITE_RETRIES=20
    VCOUNT=0
    until curl -s http://127.0.0.1:3000 > /dev/null 2>&1 || [ $VCOUNT -ge $MAX_VITE_RETRIES ]; do
        sleep 0.3
        echo -n "."
        VCOUNT=$((VCOUNT+1))
    done
    echo ""
else
    echo "[2/3] ✓ Vite UI server already running on http://localhost:3000"
fi

# 3. Launch Electron Background Daemon & Floating Overlay Pill
echo "[3/3] Launching Wispr Flow Background Daemon & Tray..."
cd "$PROJECT_ROOT/my_wispr"
./node_modules/.bin/electron --no-sandbox electron/main.cjs
