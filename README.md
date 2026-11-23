# My Wispr (Wispr Flow Voice Dictation Daemon & Client)

A clean, high-performance voice-dictation desktop application reverse-engineered from Wispr Flow and reconstructed with React 19, TypeScript, Tailwind CSS, Vite, Electron, and a live high-throughput dedicated cloud backend.

---

## 🚀 Live Backend & Connection Settings
The client connects directly to our verified, dedicated cloud backend server:

* **Base URL**: `https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech`
* **Real-Time Audio WebSocket**: `wss://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech/api/v1/meetings/transcribe`
* **Health Check**: `GET https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech/health`
* **Batch / Re-transcribe**: `POST https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech/transcribe`
* **Architecture**: Cloud VM running Layer 1 NVIDIA Parakeet 0.6B INT8 ASR + Layer 2 native C++ Qwen 2.5 3B Q4_K_M cleanup.
* **Option A Streaming**: Real-time intermediate clause updates (~400ms pause streaming) via Silero VAD.
* **Audio Retention**: Stateless server; 100% client-side IndexedDB (`flow-dictation-db`).
* **Alternative Self-Hosted LLM**: Direct support for pointing to an OpenAI-compatible local/LAN server (e.g. `http://192.168.1.126:11434/v1` for Ollama/LM Studio) inside the Settings modal.

---

## 📁 Repository Structure

```
my_wispr/
├── backend_communication_contract.md   # Complete API & WebSocket schema contract
├── backend_architecture_for_ai_studio.md # System architecture documentation
├── my_wispr/                           # Desktop client & Electron background daemon
│   ├── electron/                       # Native daemon (main.cjs, tray, shortcuts)
│   ├── public/assets/                  # Sound chimes & tray icons
│   ├── resources/bin/                  # Native Linux evdev key listeners
│   ├── src/components/                 # OverlayPill, SettingsModal, Sidebar, Toast
│   ├── src/pages/                      # DictationPage, DictionaryPage, InsightsPage, OverlayRoute
│   ├── src/services/                   # WebSocket client (api.ts), audio capture, hotkeys, platform
│   ├── src/store/                      # Zustand useFlowStore
│   ├── src/types/                      # AppSettings & WebSocket type definitions
│   └── tests/                          # Automated daemon & lifecycle integration tests
├── server/                             # Standalone Python ASR & Layer 2 refiner
├── start_client.sh                     # Launch desktop client daemon & tray
├── start_local.sh                      # Launch local development stack
├── run_tests.sh                        # Run full test suite across all 46 test cases
└── package.json
```

---

## 🎙️ Global Hotkeys & Linux Smart Paste

* **Hands-Free Dictation**: `Ctrl + Alt + Space` (tap once to start recording, speak freely, tap again or `Esc` to finish and paste).
* **Push-to-Talk (PTT)**: `fn` / `Right Ctrl` (hold to speak, release to finish and paste).
* **Linux Smart Paste**: Text is written to clipboard + primary selection and injected into whichever external window is focused using `ydotool` (`Shift + Insert` keycodes `42:1 110:1 110:0 42:0`) via `/run/user/1000/.ydotool_socket`.

---

## 🧪 Testing

To run the full suite of unit and integration tests:

```bash
./run_tests.sh
```

All 46 tests pass across 6 test suites covering:
* PCM audio downsampling to 16 kHz Int16 and 1,024-byte packetization
* Wispr Flow text pipeline (filler-word removal, self-corrections, dictionary replacements)
* Dual hotkey lifecycle matching (`Ctrl + Alt + Space` and `fn`)
* Electron daemon, tray initialization, and smart paste injection
