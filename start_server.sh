#!/usr/bin/env bash
# Standalone Server Launcher for Wispr Flow Backend
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Starting Wispr Flow Private ASR Server ==="
"$PROJECT_ROOT/server/.venv/bin/uvicorn" src.main:app --app-dir "$PROJECT_ROOT/server" --host 127.0.0.1 --port 8000 --reload
