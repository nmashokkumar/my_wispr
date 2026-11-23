# Flow — Desktop Voice Dictation App & Self-Hostable Backend

A local-first desktop voice-dictation app inspired by Wispr Flow with a real Express + TypeScript backend modeled after **OpenWhispr's** transcription, dictionary prompt/echo-filtering, tone-style cleanup, and self-hosted server architecture. Designed to be wrapped in **Electron** or **Tauri** on Ubuntu/Wayland.

## Backend Architecture (OpenWhispr-Inspired)

The built-in Node/Express backend (`server.ts`, `server/transcriptionService.ts`, `server/openwhisprPipeline.ts`) runs on port `3000` alongside the web UI and exposes shareable HTTP endpoints:

- **`GET /health`** (aliases: `/api/health`, `/v1/health`) — Returns active provider, model, cleanup engine, auth mode, and endpoint paths.
- **`POST /transcribe`** (aliases: `/api/transcribe`, `/v1/transcribe`) — Flow's full 4-stage pipeline (`Record -> Transcribe -> Clean up -> Polish`) accepting `multipart/form-data`:
  - `audio` (or `file`): `audio/webm`, `wav`, `mp3`, `ogg`, `flac`, `m4a` (up to 25 MB)
  - `style`: `"formal" | "casual" | "very_casual"`
  - `context`: `"personal" | "work" | "email" | "other"`
  - `cleanup`: JSON string of `{ removeFillerWords, applySelfCorrections, autoPunctuation, autoCapitalization }`
  - `dictionary`: JSON array of `{ type, trigger, replacement }`
  - `language`: `"en"` (or ISO-639 code)
- **`POST /v1/audio/transcriptions`** & **`POST /inference`** — OpenAI / OpenWhispr / `whisper.cpp` compatible endpoints so external desktop clients (including OpenWhispr or your Electron/Tauri build) can point directly at your shared server link.

### Supported Transcription Backends

Configure via `.env` (see `.env.example`):

1. **Built-in Gemini Audio + Polish (Default)**
   - Uses `GEMINI_API_KEY` server-side with `gemini-3.5-transcribe` for speech-to-text and `gemini-4-hydrogen` for OpenWhispr-style tone cleanup + filler/self-correction removal.
   - Applies dictionary prompt hints, OpenWhispr's silence echo filter (`stripDictionaryEcho`), and duplication guard (`isDuplicatedCleanupOutput`) with deterministic local fallback (`src/utils/textPipeline.ts`).
2. **Self-Hosted Whisper / Own Server Forwarding**
   - Set `UPSTREAM_TRANSCRIBE_URL` to point Flow's backend at your own Faster-Whisper, Speaches, LocalAI, Groq, OpenAI, or `whisper.cpp` server:
     - OpenAI-compatible: `UPSTREAM_TRANSCRIBE_URL="http://127.0.0.1:8000/v1"` (`UPSTREAM_TRANSCRIBE_FORMAT="openai"`)
     - `whisper.cpp`: `UPSTREAM_TRANSCRIBE_URL="http://127.0.0.1:8080/inference"` (`UPSTREAM_TRANSCRIBE_FORMAT="whisper-cpp"`)
   - Optionally set `UPSTREAM_CLEANUP_URL` (e.g., local Ollama `http://127.0.0.1:11434/v1`) for fully local LLM tone polishing.

### Sharing Your Server Link

1. Deploy or run `npm run build && npm start` on your own Linux server.
2. Optionally set `FLOW_API_KEY` to protect `/health`, `/transcribe`, `/v1/audio/transcriptions`, and `/inference` with constant-time API key verification (`X-API-Key` or `Authorization: Bearer <key>`).
3. Optionally set `CORS_ORIGINS` (comma-separated) for browser clients on other domains; local Electron/Tauri (`http://localhost:*`, `app://*`, `tauri://localhost`) and same-origin requests are allowed automatically.
4. Paste your server link (and API key if configured) into **Settings → Server Base URL**, then click **Test connection**.

## Wrapping in Electron or Tauri (Ubuntu / Wayland)

Three browser-side adapters are isolated so you can swap them for native desktop bindings without touching UI components:

1. **Global Hotkeys (`src/services/hotkeys.ts`)**
   - Implement `HotkeyProvider` using Electron `globalShortcut` / `uiohook-napi` or Tauri / Wayland GlobalShortcuts portal (`org.freedesktop.portal.GlobalShortcuts`).
2. **OS Text Insertion (`src/services/platform.ts`)**
   - Implement `PlatformBridge.insertText(text)` via IPC to inject text into the focused Wayland/X11 window (`wtype`, `ydotool type`, or clipboard copy + synthetic `Ctrl+V`).
3. **Always-on-Top Transparent Overlay (`/overlay` route in `src/pages/OverlayRoute.tsx`)**
   - Open a frameless, transparent, always-on-top, non-focusable BrowserWindow / WebviewWindow pointed at `/overlay` (positioned bottom-center, `24px` above the bottom edge), synced via `BroadcastChannel('flow-overlay-sync')` or IPC.
