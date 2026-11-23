import type { DictionaryEntry, TranscribeResponse } from '../types';
import { deriveWebSocketUrl } from '../utils/pcmAudio';
import {
  applyLocalCleanupPipeline,
  countStrippedFillersAndCorrections,
  countWords,
} from '../utils/textPipeline';

export const LIVE_SEAMLESS_SERVER_URL = 'https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech';

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  mockMode: boolean;
  timeoutMs?: number;
}

export interface BatchTranscribePayload {
  audio: Blob;
  style?: string;
  dictionary: DictionaryEntry[];
  language?: string;
  filename?: string;
}

export interface ProcessedTranscribeResult {
  text: string;
  formatted_text: string;
  raw_text: string;
  num_words: number;
  language: string;
  duration_ms: number;
  fillerRemovedCount: number;
  correctionsAppliedCount: number;
}

const MOCK_RAW_SAMPLES = [
  'um so can you send the the report to Sarah by uh Thursday actually no Friday and let her know its nearly done',
  'uh btw i just tested Wispr Flow on Ubuntu Wayland and the latency feels super crisp today',
  'hey are you free for lunch tomorrow lets do 12 actually no 12:30 if that works for you',
  'um basically quick update for the team we finished the Kubernetes dictionary import and uh all tests are passing now',
  'could you review the pull request before 4 pm and let me know if anything looks off',
];

let mockSampleIndex = 0;

export function getDefaultServerUrl(): string {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_FLOW_API_URL
      ? String(import.meta.env.VITE_FLOW_API_URL).trim()
      : '';
  return (envUrl || LIVE_SEAMLESS_SERVER_URL).replace(/\/+$/, '');
}

export function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:api\/v1\/meetings\/transcribe|api\/|v1\/)?(?:transcribe|health|audio\/transcriptions|inference)$/i, '');
}

export function serializeDictionaryForApi(dictionary: DictionaryEntry[]) {
  return dictionary.map((d) =>
    d.type === 'replacement' && d.replacement
      ? { type: 'replacement' as const, trigger: d.trigger, replacement: d.replacement }
      : { type: 'word' as const, trigger: d.trigger }
  );
}

function buildProcessedResult(
  data: Partial<TranscribeResponse>,
  fallbackDurationMs: number,
  language = 'en'
): ProcessedTranscribeResult {
  const formattedText = String(data.formatted_text ?? data.text ?? '').trim();
  const rawText = String(data.raw_text ?? formattedText).trim();
  const finalText = formattedText || rawText;
  const numWords =
    typeof data.num_words === 'number' && data.num_words > 0
      ? data.num_words
      : countWords(finalText);
  const durationMs =
    typeof data.duration_ms === 'number' && data.duration_ms > 0
      ? Math.round(data.duration_ms)
      : Math.max(500, fallbackDurationMs);

  const diff = countStrippedFillersAndCorrections(rawText, finalText);

  return {
    text: finalText,
    formatted_text: finalText,
    raw_text: rawText,
    num_words: numWords,
    language: data.language || language,
    duration_ms: durationMs,
    fillerRemovedCount: diff.fillersRemoved,
    correctionsAppliedCount: diff.correctionsFixed,
  };
}

/**
 * Generates a realistic local mock result when Mock mode is enabled in Settings.
 */
export async function runMockTranscription(
  dictionary: DictionaryEntry[],
  language = 'en'
): Promise<ProcessedTranscribeResult> {
  await new Promise((resolve) => setTimeout(resolve, 650));
  const rawSample = MOCK_RAW_SAMPLES[mockSampleIndex % MOCK_RAW_SAMPLES.length];
  mockSampleIndex += 1;

  const processed = applyLocalCleanupPipeline(rawSample, {
    style: 'standard',
    context: 'work',
    cleanup: {
      removeFillerWords: true,
      applySelfCorrections: true,
      autoPunctuation: true,
      autoCapitalization: true,
    },
    dictionary,
  });

  const numWords = Math.max(4, countWords(processed.text));
  const simulatedDurationMs = Math.round((numWords / 168) * 60000);
  const diff = countStrippedFillersAndCorrections(rawSample, processed.text);

  return {
    text: processed.text,
    formatted_text: processed.text,
    raw_text: rawSample,
    num_words: numWords,
    language,
    duration_ms: simulatedDurationMs,
    fillerRemovedCount: Math.max(diff.fillersRemoved, processed.fillerRemovedCount),
    correctionsAppliedCount: Math.max(diff.correctionsFixed, processed.correctionsAppliedCount),
  };
}

/**
 * Checks backend availability via GET {baseUrl}/health (with graceful fallback to GET {baseUrl}/).
 */
export async function checkServerHealth(config: ApiClientConfig): Promise<{
  ok: boolean;
  latencyMs: number;
  message: string;
}> {
  const started = performance.now();

  if (config.mockMode) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      message: 'Mock transcription engine active (local simulation ready).',
    };
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!baseUrl) {
    return { ok: false, latencyMs: 0, message: 'Server URL is empty.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 8000);

  try {
    const headers: Record<string, string> = {};
    if (config.apiKey?.trim()) {
      headers['X-API-Key'] = config.apiKey.trim();
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    let res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (res.status === 404) {
      res = await fetch(`${baseUrl}/`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    }

    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        message: `Server returned HTTP ${res.status} (${res.statusText || 'Error'}).`,
      };
    }

    let detail = '';
    try {
      const info = (await res.json()) as {
        status?: string;
        provider?: string;
        model?: string;
      };
      if (info.provider && info.model) {
        detail = ` — ${info.provider} (${info.model})`;
      } else if (info.status) {
        detail = ` — ${info.status}`;
      }
    } catch {
      // Plain 200 OK health responses are valid
    }

    return {
      ok: true,
      latencyMs,
      message: `Connected to ${baseUrl} (${latencyMs} ms)${detail}.`,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        latencyMs,
        message: `Connection timed out after ${Math.round((config.timeoutMs ?? 8000) / 1000)}s.`,
      };
    }
    return {
      ok: false,
      latencyMs,
      message: `Could not reach ${baseUrl}. Verify the server is running and CORS is enabled.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeOpenAiBaseUrl(url: string): string {
  let clean = url.trim().replace(/\/+$/, '');
  if (!clean.endsWith('/v1')) {
    clean = `${clean}/v1`;
  }
  return clean;
}

/**
 * Probes a self-hosted OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, llama-server)
 * via GET {baseUrl}/v1/models to verify availability and list loaded models.
 */
export async function checkOpenAICompatibleHealth(config: {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; latencyMs: number; message: string; models?: string[] }> {
  const started = performance.now();
  const v1Base = normalizeOpenAiBaseUrl(config.baseUrl || 'http://192.168.1.126:11434/v1');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    const res = await fetch(`${v1Base}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        message: `Self-hosted server returned HTTP ${res.status} (${res.statusText || 'Error'}).`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id: string }>;
    };
    const models = Array.isArray(data.data) ? data.data.map((m) => m.id) : [];
    return {
      ok: true,
      latencyMs,
      message: `Connected to self-hosted server (${latencyMs} ms, ${models.length} model${models.length === 1 ? '' : 's'} found).`,
      models,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      ok: false,
      latencyMs,
      message: err instanceof Error ? err.message : 'Could not reach self-hosted server.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends a speech transcript to a self-hosted OpenAI-compatible LLM endpoint
 * (e.g. Ollama / LM Studio) for Layer 2 text cleanup and grammar polishing.
 */
export async function cleanWithSelfHostedLLM(
  rawText: string,
  config: {
    baseUrl: string;
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
  }
): Promise<string> {
  if (!rawText.trim()) return rawText;
  const v1Base = normalizeOpenAiBaseUrl(config.baseUrl || 'http://192.168.1.126:11434/v1');
  const model = config.model?.trim() || 'qwen2.5:3b';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 15000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    const res = await fetch(`${v1Base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert dictation assistant. Clean up the following speech transcript by removing filler words (um, uh, like), correcting repeated words or false starts, and fixing punctuation. Preserve the speaker\'s original intent and phrasing. Return ONLY the polished text without any commentary or quotation marks.',
          },
          {
            role: 'user',
            content: rawText,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Self-hosted LLM error (${res.status}): ${res.statusText}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const cleaned = data.choices?.[0]?.message?.content?.trim();
    return cleaned || rawText;
  } catch (err) {
    console.warn('[SelfHostedLLM] Cleanup failed, falling back to raw text:', err);
    return rawText;
  } finally {
    clearTimeout(timeout);
  }
}

export interface StreamingClauseUpdate {
  clauseIndex: number;
  clauseText: string;
  accumulatedText: string;
}

/**
 * Live streaming WebSocket client for Seamless M4T v2 / Parakeet ASR + Layer 2 LLM backend:
 * 1. Connects to wss://{host}/api/v1/meetings/transcribe
 * 2. Sends JSON handshake: { type: "start", preset: "standard", app_context, dictionary }
 * 3. Streams 1,024-byte (512-sample = 32ms) 16kHz 16-bit PCM binary ArrayBuffer frames
 * 4. Listens for live intermediate clauses: { status: "clause", clause_index, clause_text, accumulated_text, is_final: false }
 * 5. Sends { type: "stop" } and resolves with the server's final JSON payload { status: "ok", formatted_text, is_final: true }
 */
export class StreamingDictationSession {
  private ws: WebSocket | null = null;
  private isOpen = false;
  private isClosed = false;
  private isAborted = false;
  private stopSent = false;
  private pendingPackets: ArrayBuffer[] = [];
  private onClause?: (clause: StreamingClauseUpdate) => void;

  private finalResolve: ((result: ProcessedTranscribeResult) => void) | null = null;
  private finalReject: ((err: Error) => void) | null = null;
  private finalTimeout: ReturnType<typeof setTimeout> | null = null;
  private fallbackDurationMs = 1000;

  private readonly wsUrl: string;
  private readonly handshakePayload: {
    type: 'start';
    preset: string;
    app_context: string;
    dictionary: ReturnType<typeof serializeDictionaryForApi>;
  };

  constructor(options: {
    baseUrl: string;
    appContext: string;
    dictionary: DictionaryEntry[];
    preset?: string;
    apiKey?: string;
    onClause?: (clause: StreamingClauseUpdate) => void;
  }) {
    this.onClause = options.onClause;
    const url = deriveWebSocketUrl(options.baseUrl);
    if (options.apiKey?.trim()) {
      const sep = url.includes('?') ? '&' : '?';
      this.wsUrl = `${url}${sep}api_key=${encodeURIComponent(options.apiKey.trim())}`;
    } else {
      this.wsUrl = url;
    }

    this.handshakePayload = {
      type: 'start',
      preset: options.preset || 'standard',
      app_context: options.appContext || 'Slack',
      dictionary: serializeDictionaryForApi(options.dictionary),
    };
  }

  connect(): void {
    const ws = new WebSocket(this.wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      if (this.isAborted) {
        ws.close();
        return;
      }
      this.isOpen = true;
      ws.send(JSON.stringify(this.handshakePayload));

      // Flush any PCM packets buffered while the handshake was opening
      for (const packet of this.pendingPackets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(packet);
        }
      }
      this.pendingPackets = [];

      if (this.stopSent && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data) as Partial<TranscribeResponse> & {
          error?: string;
          message?: string;
          clause_index?: number;
          clause_text?: string;
          accumulated_text?: string;
        };

        if (msg.status === 'error' || msg.error) {
          this.rejectFinal(new Error(msg.error || msg.message || 'Transcription server returned an error.'));
          return;
        }

        // Ready acknowledgment frame from backend
        if (msg.status === 'ready') {
          return;
        }

        // Option A: Intermediate clause updates during natural speech pauses
        if (msg.status === 'clause') {
          const accumulated = String(msg.accumulated_text ?? msg.clause_text ?? '').trim();
          const clause = String(msg.clause_text ?? '').trim();
          if (accumulated || clause) {
            this.onClause?.({
              clauseIndex: typeof msg.clause_index === 'number' ? msg.clause_index : 1,
              clauseText: clause,
              accumulatedText: accumulated,
            });
          }
          return;
        }

        const hasTranscript =
          typeof msg.formatted_text === 'string' || typeof msg.text === 'string';
        if (msg.is_final === true || (this.stopSent && hasTranscript)) {
          const result = buildProcessedResult(msg, this.fallbackDurationMs);
          this.resolveFinal(result);
        }
      } catch {
        // Ignore non-JSON keepalive frames
      }
    };

    ws.onerror = () => {
      if (!this.isAborted && this.finalReject) {
        this.rejectFinal(new Error('WebSocket connection error while streaming audio to server.'));
      }
    };

    ws.onclose = (ev) => {
      this.isClosed = true;
      this.isOpen = false;
      if (!this.isAborted && this.finalReject) {
        const reason = ev.reason ? ` (${ev.reason})` : '';
        this.rejectFinal(
          new Error(`Transcription stream closed before returning final text${reason}.`)
        );
      }
    };
  }

  sendPcmPacket(packet: ArrayBuffer): void {
    if (this.isAborted || this.isClosed || this.stopSent) return;
    if (this.isOpen && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(packet);
    } else if (this.pendingPackets.length < 400) {
      // Buffer up to ~12.8s while connecting so first spoken words are preserved
      this.pendingPackets.push(packet);
    }
  }

  finish(fallbackDurationMs: number, timeoutMs = 30000): Promise<ProcessedTranscribeResult> {
    this.fallbackDurationMs = Math.max(400, fallbackDurationMs);
    this.stopSent = true;

    return new Promise<ProcessedTranscribeResult>((resolve, reject) => {
      if (this.isAborted) {
        reject(new Error('Dictation was cancelled.'));
        return;
      }

      if (!this.ws || this.isClosed) {
        reject(new Error('WebSocket is not connected to transcription server.'));
        return;
      }

      this.finalResolve = resolve;
      this.finalReject = reject;

      this.finalTimeout = setTimeout(() => {
        this.rejectFinal(
          new Error(`Timed out waiting for polished transcript after ${Math.round(timeoutMs / 1000)}s.`)
        );
      }, timeoutMs);

      if (this.isOpen && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      }
    });
  }

  abort(): void {
    this.isAborted = true;
    this.pendingPackets = [];
    if (this.finalTimeout) {
      clearTimeout(this.finalTimeout);
      this.finalTimeout = null;
    }
    this.finalResolve = null;
    this.finalReject = null;
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
  }

  private resolveFinal(result: ProcessedTranscribeResult): void {
    if (this.finalTimeout) {
      clearTimeout(this.finalTimeout);
      this.finalTimeout = null;
    }
    const resolve = this.finalResolve;
    this.finalResolve = null;
    this.finalReject = null;
    try {
      this.ws?.close(1000, 'complete');
    } catch {
      // Ignore
    }
    resolve?.(result);
  }

  private rejectFinal(err: Error): void {
    if (this.finalTimeout) {
      clearTimeout(this.finalTimeout);
      this.finalTimeout = null;
    }
    const reject = this.finalReject;
    this.finalResolve = null;
    this.finalReject = null;
    try {
      this.ws?.close();
    } catch {
      // Ignore
    }
    reject?.(err);
  }
}

/**
 * Batch Re-transcribe endpoint:
 * POST {baseUrl}/transcribe with multipart FormData:
 *   audio: retranscribe.webm
 *   style: 'standard'
 *   dictionary: JSON string of custom dictionary
 *   language: 'en'
 */
export async function batchTranscribeAudio(
  payload: BatchTranscribePayload,
  config: ApiClientConfig
): Promise<ProcessedTranscribeResult> {
  const language = payload.language ?? 'en';

  if (config.mockMode) {
    return runMockTranscription(payload.dictionary, language);
  }

  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!baseUrl) {
    throw new Error('Server URL is not configured. Open Settings to set your server URL.');
  }

  const formData = new FormData();
  const audioFilename = payload.filename ?? 'retranscribe.webm';
  formData.append('audio', payload.audio, audioFilename);
  formData.append('file', payload.audio, audioFilename);
  formData.append('style', payload.style || 'standard');
  formData.append('dictionary', JSON.stringify(serializeDictionaryForApi(payload.dictionary)));
  formData.append('language', language);

  const headers: Record<string, string> = {};
  if (config.apiKey?.trim()) {
    headers['X-API-Key'] = config.apiKey.trim();
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Re-transcribe server error (${response.status}): ${errorBody.slice(0, 140) || response.statusText}`
      );
    }

    const data = (await response.json()) as Partial<TranscribeResponse>;
    return buildProcessedResult(data, 3000, language);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Re-transcribe timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Network error reaching ${baseUrl}/transcribe.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
