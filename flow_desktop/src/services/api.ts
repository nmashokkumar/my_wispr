import type {
  AutoCleanupConfig,
  DictionaryEntry,
  StyleContext,
  StylePreset,
  TranscribeResponse,
} from '../types';
import { applyLocalCleanupPipeline } from '../utils/textPipeline';

export interface TranscribeRequestPayload {
  audio: Blob;
  style: StylePreset;
  context: StyleContext;
  cleanup: AutoCleanupConfig;
  dictionary: DictionaryEntry[];
  language?: string;
}

export interface ApiClientConfig {
  baseUrl: string;
  apiKey?: string;
  mockMode: boolean;
  timeoutMs?: number;
  enableAiCleanup?: boolean;
  llmEndpointUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
}

export interface ProcessedTranscribeResult extends TranscribeResponse {
  fillerRemovedCount: number;
  correctionsAppliedCount: number;
  dictionaryAppliedCount: number;
  usedFallbackCleanup: boolean;
}

const DEFAULT_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FLOW_API_URL) || 'http://localhost:8000';

export function getDefaultServerUrl(): string {
  return DEFAULT_BASE_URL;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Checks backend availability via GET {baseUrl}/health or {baseUrl}/models.
 */
export async function checkServerHealth(config: ApiClientConfig): Promise<{
  ok: boolean;
  latencyMs: number;
  message: string;
}> {
  const started = performance.now();
  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
  if (!baseUrl) {
    return { ok: false, latencyMs: 0, message: 'Server URL is empty.' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);

  try {
    const headers: Record<string, string> = {};
    if (config.apiKey?.trim()) {
      headers['X-API-Key'] = config.apiKey.trim();
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    // Try /health first, then /models (for Ollama, vLLM, or OpenAI-compatible endpoints)
    let res: Response | null = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      }).catch(() => null);
    }

    const latencyMs = Math.round(performance.now() - started);
    if (!res || !res.ok) {
      return {
        ok: false,
        latencyMs,
        message: `Could not reach ${baseUrl}. Verify the server is running.`,
      };
    }

    return {
      ok: true,
      latencyMs,
      message: `Connected to ${baseUrl} (${latencyMs} ms).`,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    return {
      ok: false,
      latencyMs,
      message: `Connection error: ${err instanceof Error ? err.message : 'Unreachable'}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Calls OpenAI-compatible /chat/completions endpoint (e.g. Ollama, LM Studio, vLLM)
 * for AI dictation cleanup, grammar correction, and smart punctuation.
 */
export async function applyAiCleanup(
  rawText: string,
  config: { endpointUrl: string; apiKey?: string; model?: string; timeoutMs?: number }
): Promise<string | null> {
  if (!rawText || !rawText.trim() || !config.endpointUrl) return null;
  const baseUrl = normalizeBaseUrl(config.endpointUrl);
  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 6000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model?.trim() || 'llama3',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert AI dictation editor. Clean up the spoken dictation: remove verbal filler words (um, uh, like, you know), resolve speech self-corrections, fix punctuation and capitalization, and preserve the speaker\'s original intent and tone. Respond with ONLY the refined text, without quotes, notes, or markdown fences.',
          },
          {
            role: 'user',
            content: rawText,
          },
        ],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[AI Cleanup] LLM endpoint returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === 'string' && content.trim()) {
      return content.trim();
    }
    return null;
  } catch (err) {
    console.warn('[AI Cleanup] LLM endpoint error, falling back to local pipeline:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends audio + dictation settings to ASR server as multipart/form-data.
 * Supports Wispr Flow private server, standard OpenAI /audio/transcriptions,
 * and AI Language Model post-cleanup (e.g. Ollama at http://192.168.1.126:11434/v1).
 */
export async function transcribeAudio(
  payload: TranscribeRequestPayload,
  config: ApiClientConfig,
  onStageChange?: (stage: 'transcribe' | 'cleanup' | 'polish') => void
): Promise<ProcessedTranscribeResult> {
  const language = payload.language ?? 'en';

  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
  if (!baseUrl) {
    throw new Error('Server URL is not configured. Please ensure your ASR server on http://localhost:8000 is active.');
  }

  const formData = new FormData();
  formData.append('audio', payload.audio, 'dictation.webm');
  formData.append('file', payload.audio, 'dictation.webm'); // for standard OpenAI format
  formData.append('model', 'whisper-1');
  formData.append('style', payload.style);
  formData.append('context', payload.context);
  formData.append('cleanup', JSON.stringify(payload.cleanup));
  formData.append(
    'dictionary',
    JSON.stringify(
      payload.dictionary.map((d) => ({
        type: d.type,
        trigger: d.trigger,
        replacement: d.replacement ?? null,
      }))
    )
  );
  formData.append('language', language);

  const headers: Record<string, string> = {};
  if (config.apiKey?.trim()) {
    headers['X-API-Key'] = config.apiKey.trim();
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? 25000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    onStageChange?.('transcribe');
    // Determine whether to use /transcribe or standard /audio/transcriptions
    const sttUrl = baseUrl.endsWith('/v1') || baseUrl.includes('/audio/transcriptions')
      ? (baseUrl.endsWith('/audio/transcriptions') ? baseUrl : `${baseUrl}/audio/transcriptions`)
      : `${baseUrl}/transcribe`;

    let response = await fetch(sttUrl, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    }).catch(() => null);

    // If /transcribe failed on custom server, fallback to /v1/audio/transcriptions
    if ((!response || !response.ok) && !sttUrl.includes('/audio/transcriptions')) {
      response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      }).catch(() => response);
    }

    if (!response || !response.ok) {
      const errorBody = response ? await response.text().catch(() => '') : '';
      throw new Error(
        `Transcription server error (${response?.status || 'network'}): ${errorBody.slice(0, 120) || response?.statusText || 'Could not connect'}`
      );
    }

    onStageChange?.('cleanup');
    const data = (await response.json()) as Partial<TranscribeResponse>;
    const rawText = (data.raw_text ?? data.text ?? '').trim();
    let serverText = (data.text ?? '').trim();

    // 2. AI Language Model cleanup (e.g. Ollama http://192.168.1.126:11434/v1)
    if (config.enableAiCleanup && config.llmEndpointUrl) {
      const aiCleaned = await applyAiCleanup(rawText || serverText, {
        endpointUrl: config.llmEndpointUrl,
        apiKey: config.llmApiKey,
        model: config.llmModel,
      });
      if (aiCleaned) {
        serverText = aiCleaned;
      }
    }

    onStageChange?.('polish');

    // If no server/AI cleanup occurred, apply local fallback rules
    const needsLocalFallback = !serverText || serverText === rawText;
    const localTransform = applyLocalCleanupPipeline(needsLocalFallback ? rawText : serverText, {
      style: payload.style,
      context: payload.context,
      cleanup: payload.cleanup,
      dictionary: payload.dictionary,
    });

    return {
      text: needsLocalFallback ? localTransform.text : serverText,
      raw_text: rawText || serverText,
      language: data.language || language,
      duration_ms: typeof data.duration_ms === 'number' && data.duration_ms > 0 ? data.duration_ms : 3000,
      fillerRemovedCount: localTransform.fillerRemovedCount,
      correctionsAppliedCount: localTransform.correctionsAppliedCount,
      dictionaryAppliedCount: localTransform.dictionaryAppliedCount,
      usedFallbackCleanup: needsLocalFallback,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Check your transcription server.`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Network error reaching ${baseUrl}. Enable Mock mode in Settings to test offline.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
