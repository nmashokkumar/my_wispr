# Wispr Flow (Flow Desktop + Private Cloud Server)

A clean, high-performance voice-dictation application reverse-engineered from the official Wispr Flow design and reconstructed with React 19, TypeScript, Tailwind CSS, Vite, and FastAPI.

---

## Architecture Overview

```
wisprflow/
├── flow_desktop/             # Frontend UI (Generated from Google AI Studio & reference media)
│   ├── public/assets/        # Official audio sounds (dictation-start, paste) & icons
│   ├── src/components/       # OverlayPill (Hold vs Hands-free), Sidebar, SettingsModal
│   ├── src/pages/            # DictationPage, DictionaryPage, StylePage, InsightsPage, OverlayRoute
│   ├── src/services/         # API client, audio recorder, hotkey provider, IndexedDB store
│   └── src/utils/            # Text cleanup pipeline (filler words, self-correction, presets)
│
├── server/                   # Private Self-Hosted ASR Backend (Port 8000)
│   ├── Dockerfile            # Container deployment (x86_64 & ARM64 Ampere)
│   ├── docker-compose.yml
│   └── src/                  # FastAPI endpoints (/health, /transcribe, /v1/audio/transcriptions)
│
├── start_local.sh            # One-command launcher (Starts Backend Server + Flow Desktop UI)
├── start_client.sh           # Standalone Flow Desktop UI launcher
├── start_server.sh           # Standalone Server launcher
└── package.json
```

---

## Quick Start & Usage

### 🚀 1. One-Command Launch (Backend Server + Flow Desktop)
From the project root:
```bash
./start_local.sh
```
*(or run `npm start`)*

This script:
1. Boots the private speech-to-text backend on `http://127.0.0.1:8000`.
2. Verifies health status via `GET /health`.
3. Launches **Flow Desktop** on `http://localhost:3000`.

---

### 🎙️ 2. Core Dictation Modes
Flow Desktop provides dual-mode dictation:
1. **Push-to-Talk (Hold Mode)**: Hold down the configured hotkey while speaking. Releasing it stops recording, cleans up filler words, and delivers formatted text.
2. **Hands-Free Mode (Toggle Mode)**: Tap the hotkey once to start recording; speak freely; tap again to finalize and transcribe.

---

### 🗂️ 3. Features Included
- **4-Stage Live Transcription Pipeline**: Real-time visual progress through **Record ➔ Transcribe ➔ Clean up ➔ Polish**.
- **Audio Waveform Visualizer**: Smooth dynamic bars responding to microphone RMS levels.
- **Custom Dictionary**: Add trigger phrases and custom spellings/replacements.
- **Style Presets**: Formal, Casual, and Very Casual tones.
- **Insights & History**: Local storage of speech history with word count analytics.

---

### 🧪 4. Running Unit Tests
To run unit tests for the text pipeline and hotkeys:
```bash
cd flow_desktop && npm test
```
*(All 10 tests pass in <1 second)*
