# 🧠 Wispr Flow Backend — Full Architecture Brief for Google AI Studio

> **Purpose:** This document gives Google AI Studio (or any coding agent) everything it needs to understand, rebuild, extend, or deploy the Wispr Flow private cloud backend. No prior context is needed — everything is here.

---

## 1. Project Overview

**Wispr Flow** is a self-hosted, private cloud speech dictation system. The user speaks, the server transcribes audio into text (ASR), optionally cleans it up (removes filler words, fixes punctuation), and returns polished text to a desktop frontend (Electron app on Linux). Think of it as a **private Whisper-powered dictation engine** with a WebSocket streaming interface.

**Current deployment:** Hosted on **Instabox** (free-tier cloud VM) — the server is live for **8-hour sessions**, goes offline for a **20–30 min cooldown**, then auto-restarts. The server must be kept alive with periodic pings.

---

## 2. Live Server Credentials & Endpoints

| Field             | Value                                                        |
|-------------------|--------------------------------------------------------------|
| **Base URL**      | `https://instabox.tech` *(or the assigned subdomain)*        |
| **HTTP Port**     | `8000`                                                       |
| **API Key**       | *(none — open/private LAN mode, no auth token required)*     |
| **CORS**          | `allow_origins: ["*"]` — all origins accepted                |
| **Health Check**  | `GET /health`                                                |
| **WebSocket**     | `ws://<host>:8000/api/v1/meetings/transcribe`                |

> [!CAUTION]
> The Instabox free tier shuts off after **8 hours of activity** and needs a 20–30 min cooldown. A keep-alive ping script should hit `/health` every **18 minutes** to prevent sleep. After a cooldown, the server auto-restarts — the client must handle reconnection gracefully.

---

## 3. Full API Contract

### 3A. Health Check
```
GET /health
```
**Response:**
```json
{
  "status": "ok",
  "service": "wisprflow-server",
  "version": "1.0.0",
  "uptime": "active"
}
```

---

### 3B. Main Transcription Endpoint (Base64 Audio)
```
POST /v1/audio/transcriptions
POST /llm/dictation        ← alias
POST /llm/asr              ← alias
```

**Request Body (JSON):**
```json
{
  "transcript_id": "optional-uuid-string",
  "audio_base64": "<base64-encoded WAV/PCM audio bytes>",
  "duration_ms": 3500,
  "preset": "standard",
  "app_context": "Desktop"
}
```

| Field           | Type     | Required | Description                                               |
|-----------------|----------|----------|-----------------------------------------------------------|
| `audio_base64`  | `string` | ✅ Yes   | Base64-encoded raw audio (WAV preferred)                  |
| `transcript_id` | `string` | No       | Client-side UUID to track the request                     |
| `duration_ms`   | `int`    | No       | Approximate audio duration hint                           |
| `preset`        | `string` | No       | `"standard"` (default) \| `"casual"` \| `"code"` \| `"raw"` |
| `app_context`   | `string` | No       | Context hint (e.g., `"Desktop"`, `"Code Editor"`)         |

**Response (JSON):**
```json
{
  "status": "ok",
  "transcript_id": "optional-uuid-string",
  "text": "raw asr output without formatting",
  "formatted_text": "Cleaned and polished final text.",
  "num_words": 12,
  "total_time": 0.412,
  "preset_applied": "standard"
}
```

---

### 3C. Multipart Form Upload (Alternative)
```
POST /transcribe
```
**Form Fields:**

| Field        | Type   | Description                              |
|--------------|--------|------------------------------------------|
| `audio`      | File   | WAV audio file (multipart upload)        |
| `style`      | string | `"formal"` (default)                     |
| `context`    | string | `"personal"` (default)                   |
| `cleanup`    | string | JSON string of cleanup options `"{}"`    |
| `dictionary` | string | JSON array of custom words `"[]"`        |
| `language`   | string | `"en"` (default)                         |

**Response:**
```json
{
  "text": "formatted text",
  "raw_text": "raw asr output",
  "language": "en",
  "duration_ms": 1234
}
```

---

### 3D. WebSocket Streaming Endpoint
```
WS /api/v1/meetings/transcribe
```

**Client → Server Messages:**

1. **Start session** (JSON text frame):
```json
{ "type": "start", "preset": "standard" }
```

2. **Stream audio** (binary frames):
   - Send raw PCM/WAV audio **binary chunks** as they are captured from the microphone.
   - Server responds with ACK per chunk:
   ```json
   { "status": "streaming", "bytes_received": 48000 }
   ```

3. **Stop and get result** (JSON text frame):
```json
{ "type": "stop" }
```

**Server → Client Final Response:**
```json
{
  "status": "ok",
  "text": "raw transcription text",
  "formatted_text": "Cleaned final dictation text.",
  "num_words": 15,
  "is_final": true
}
```

---

## 4. Text Refiner — Layer 2 (Cleanup Logic)

The `TextRefiner` class in `server/src/refiner.py` applies rule-based cleanup to raw ASR output.

### Filler Word Removal
Strips: `uh`, `um`, `ah`, `er`, `hm`, `hmm`, `you know`, `like like`

### Presets

| Preset       | Behavior                                                             |
|--------------|----------------------------------------------------------------------|
| `"standard"` | Remove fillers + capitalize sentences + add trailing period          |
| `"casual"`   | Same as standard but strips single trailing period (friendly tone)   |
| `"code"`     | Remove fillers, preserve technical casing, no sentence formatting    |
| `"raw"`      | Return ASR output completely unmodified                              |

---

## 5. ASR Engine — Layer 1

**Primary Engine:** [`faster-whisper`](https://github.com/SYSTRAN/faster-whisper)

| Config Key    | Value               | Notes                                           |
|---------------|---------------------|-------------------------------------------------|
| `engine`      | `faster-whisper`    | CTranslate2-based Whisper (2–5× faster)         |
| `model_name`  | `distil-large-v3`   | High accuracy, smaller footprint                |
| `device`      | `auto`              | Auto-selects CUDA if GPU present, else CPU      |
| `compute_type`| `int8`              | Quantized inference — works on ARM64 & x86_64  |
| `beam_size`   | `5`                 | Transcription search width                      |
| `language`    | `en`                | English (hardcoded for now)                     |

**Fallback:** If the model fails to load (memory, cold start, etc.), server returns a dummy string instead of crashing.

---

## 6. Stack & Infrastructure

```
┌─────────────────────────────────┐
│      Electron Desktop App       │  ← Frontend (Linux, Ctrl+Space hotkey)
│        my_wispr (Vite + TS)     │
└──────────────┬──────────────────┘
               │  HTTP POST /v1/audio/transcriptions
               │  WS  /api/v1/meetings/transcribe
               ▼
┌─────────────────────────────────┐
│   FastAPI Server (Python 3.11)  │  ← Port 8000
│   Uvicorn ASGI (async)          │
│   CORS: allow all origins       │
├─────────────────────────────────┤
│   Layer 1: faster-whisper ASR   │  ← distil-large-v3, int8
│   Layer 2: TextRefiner (regex)  │  ← Heuristic filler removal
└─────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│   Instabox Free Cloud VM        │  ← Docker container
│   Ubuntu 22.04 / Debian 12      │
│   ffmpeg + libsndfile system    │
└─────────────────────────────────┘
```

---

## 7. Deployment

### Docker (Recommended)
```bash
# In /server directory
./deploy.sh
```
This script:
1. Installs Docker if missing
2. Runs `docker compose up -d --build`
3. Exposes port 8000

### Manual (Local Dev)
```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

### Docker Compose Config
- Builds from `Dockerfile` (Python 3.11-slim base)
- System deps: `ffmpeg`, `libsndfile1`, `git`, `curl`
- Health check: `curl -f http://localhost:8000/health` every 30s

---

## 8. Keep-Alive Strategy (Instabox Free Tier)

Instabox shuts down after 30 min of inactivity **OR** after 8 hours of uptime.

**Recommended Strategy:**
- Ping `GET /health` every **18 minutes**
- If ping fails → server in cooldown → retry every 60s until it comes back (usually 20–30 min)
- Frontend should queue dictations offline during cooldown and replay when server recovers

```python
# Pseudo-logic for keep-alive script
while True:
    try:
        r = requests.get("https://<instabox-host>:8000/health", timeout=10)
        if r.status_code == 200:
            print("Server alive ✓")
            sleep(18 * 60)        # 18 min
        else:
            raise Exception("Non-200")
    except:
        print("Server offline — in cooldown. Retrying in 60s...")
        sleep(60)
```

---

## 9. Future / Optional Layer 2 Upgrade

The current refiner is **heuristic (regex-only)**. It can optionally be upgraded to an **LLM-based cleanup** via the OpenAI-compatible API:

```yaml
# config.yaml
llm_refiner:
  enabled: true
  provider: "openai_compatible"
  api_base: "http://192.168.1.126:11434/v1"   # Ollama local or cloud
  api_key: ""
  model: "qwen2.5:3b"
```

**System prompt for LLM cleanup:**
> You are an expert dictation assistant. Clean up the following speech transcript by removing filler words (um, uh, like), correcting repeated words or false starts, and fixing punctuation. Preserve the speaker's original intent and wording. Return ONLY the cleaned transcript without any commentary or explanation.

---

## 10. Key Files Reference

| File                      | Purpose                                           |
|---------------------------|---------------------------------------------------|
| `server/src/main.py`      | FastAPI app — all HTTP + WebSocket endpoints       |
| `server/src/refiner.py`   | TextRefiner class — Layer 2 text cleanup          |
| `server/config.yaml`      | ASR engine config, LLM refiner config             |
| `server/requirements.txt` | Python dependencies                               |
| `server/Dockerfile`       | Container build config                            |
| `server/deploy.sh`        | One-command deployment script                     |
| `my_wispr/`               | Electron frontend (Vite + TypeScript)             |

---

## 11. What's NOT Done Yet (Open Tasks)

- [ ] Keep-alive ping script (auto-reconnect after cooldown)
- [ ] Frontend ↔ Backend WebSocket integration (wire up `my_wispr` to call server)
- [ ] Real ASR integration test with actual microphone audio
- [ ] LLM Layer 2 integration (optional Ollama/cloud upgrade)
- [ ] Persistent session token / API key (security hardening)
