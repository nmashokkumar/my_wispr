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
 * Checks backend availability via GET {baseUrl}/health.
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
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 6000);

  try {
    const headers: Record<string, string> = {};
    if (config.apiKey?.trim()) {
      headers['X-API-Key'] = config.apiKey.trim();
      headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    }

    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    const latencyMs = Math.round(performance.now() - started);
    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        message: `Server returned HTTP ${res.status} (${res.statusText || 'Error'}).`,
      };
    }

    return {
      ok: true,
      latencyMs,
      message: `Connected to ${baseUrl} (${latencyMs} ms).`,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - started);
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        ok: false,
        latencyMs,
        message: `Connection timed out after ${Math.round((config.timeoutMs ?? 6000) / 1000)}s.`,
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

/**
 * Sends audio + dictation settings to POST {baseUrl}/transcribe as multipart/form-data.
 * Supports Mock mode (1s simulated pipeline) and applies local cleanup/dictionary/style
 * rules as a fallback whenever the server returns unpolished raw text.
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
    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(
        `Transcription server error (${response.status}): ${errorBody.slice(0, 120) || response.statusText}`
      );
    }

    onStageChange?.('cleanup');
    const data = (await response.json()) as Partial<TranscribeResponse>;
    const rawText = (data.raw_text ?? data.text ?? '').trim();
    const serverText = (data.text ?? '').trim();

    onStageChange?.('polish');

    // If the server only returned raw text (or identical uncleaned text), apply local fallback rules.
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
