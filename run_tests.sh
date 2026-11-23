#!/usr/bin/env bash
# Wispr Flow Full Test Suite (Flow Desktop Client + Private ASR Server)

set -e

echo "======================================================"
echo "      RUNNING WISPR FLOW COMPREHENSIVE TEST SUITE     "
echo "======================================================"

echo ""
echo "[1/2] My Wispr Client (Text Pipeline, Hotkeys, PCM Streaming & Electron Daemon)"
cd my_wispr
npm test
cd ..

echo ""
echo "[2/2] Private ASR Server (FastAPI Endpoints, Refiner & Whisper Engine)"
server/.venv/bin/python3 tests/test_phase7.py

echo ""
echo "======================================================"
echo "   🎉 ALL WISPR FLOW TESTS PASSED WITH ZERO ERRORS    "
echo "======================================================"
