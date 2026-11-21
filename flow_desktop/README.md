# Flow — Desktop Voice Dictation Frontend

A local-first desktop voice-dictation frontend built with React, TypeScript, Vite, Tailwind CSS, Zustand, and IndexedDB (`idb`), designed to be wrapped in **Electron** or **Tauri** on Ubuntu/Wayland.

## Connecting Your Transcription Server

1. Open **Settings** (bottom-left gear icon) or set `VITE_FLOW_API_URL` in your `.env` file (default: `http://localhost:8000`).
2. Disable **Mock mode** in Settings and optionally provide an API key (sent via both `X-API-Key` and `Authorization: Bearer <key>` headers).
3. Click **Test connection** to verify `GET {baseUrl}/health`.

### Expected Server Endpoints

- **`GET {baseUrl}/health`** — Returns HTTP `200 OK`.
- **`POST {baseUrl}/transcribe`** — Accepts `multipart/form-data`:
  - `audio`: `audio/webm` (`webm/opus` Blob)
  - `style`: `"formal" | "casual" | "very_casual"`
  - `context`: `"personal" | "work" | "email" | "other"`
  - `cleanup`: JSON string of `{ removeFillerWords, applySelfCorrections, autoPunctuation, autoCapitalization }`
  - `dictionary`: JSON array of `{ type, trigger, replacement }`
  - `language`: `"en"`

Expected JSON response:

```json
{
  "text": "Can you send the report to Sarah by Friday?",
  "raw_text": "um can you send the report to sarah by thursday actually no friday",
  "language": "en",
  "duration_ms": 4200
}
```

If your server returns raw text only (`text === raw_text` or empty `text`), Flow automatically applies the local cleanup, personal dictionary, and style rules in `src/utils/textPipeline.ts` as a fallback.

## Wrapping in Electron or Tauri (Ubuntu / Wayland)

Three browser-side adapters are cleanly isolated so you can swap them for native desktop bindings without touching UI components:

1. **Global Hotkeys (`src/services/hotkeys.ts`)**
   - Implement the `HotkeyProvider` interface using Electron's `globalShortcut` / `uiohook-napi` (needed for true keydown/keyup Push-to-Talk) or Tauri's `tauri-plugin-global-shortcut` / Wayland GlobalShortcuts portal (`org.freedesktop.portal.GlobalShortcuts`).
2. **OS Text Insertion (`src/services/platform.ts`)**
   - Implement `PlatformBridge.insertText(text)` via IPC to inject text into the focused Wayland/X11 window (e.g., `wtype`, `ydotool type`, or clipboard copy + synthetic `Ctrl+V`).
3. **Always-on-Top Transparent Overlay (`/overlay` route in `src/pages/OverlayRoute.tsx`)**
   - Open a second frameless, transparent, always-on-top, non-focusable BrowserWindow / WebviewWindow pointed at `/overlay` (positioned bottom-center, `24px` above the bottom edge).
   - State stays synchronized between the main window and `/overlay` via `BroadcastChannel('flow-overlay-sync')` (or swap for Electron `ipcMain` / Tauri events).
