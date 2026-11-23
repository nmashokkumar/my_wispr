import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { applyLocalCleanupPipeline } from '../src/utils/textPipeline.ts';
import {
  buildDictionaryPrompt,
  buildToneStylePrompt,
  extensionForAudioMime,
  getPromptCharLimit,
  isDuplicatedCleanupOutput,
  normalizeAudioMimeType,
  resolveUpstreamCleanupEndpoint,
  resolveUpstreamTranscribeEndpoint,
  stripDictionaryEcho,
  type ParsedTranscribeRequest,
  type UpstreamTranscribeFormat,
} from './openwhisprPipeline.ts';

export class TranscriptionServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'TranscriptionServiceError';
    this.statusCode = statusCode;
  }
}

export interface BackendRuntimeConfig {
  geminiApiKey: string;
  upstreamTranscribeUrl: string;
  upstreamTranscribeFormat: UpstreamTranscribeFormat;
  upstreamTranscribeModel: string;
  upstreamTranscribeApiKey: string;
  upstreamCleanupUrl: string;
  upstreamCleanupModel: string;
  upstreamCleanupApiKey: string;
  flowApiKey: string;
}

export interface BackendHealthStatus {
  ok: true;
  status: 'ok';
  mode: 'upstream' | 'gemini' | 'unconfigured';
  provider: string;
  model: string;
  cleanupProvider: 'upstream' | 'gemini' | 'local';
  authRequired: boolean;
  endpoints: {
    flow: string;
    openaiCompatible: string;
    whisperCppCompatible: string;
  };
  timestamp: string;
}

export interface BackendTranscribeResult {
  text: string;
  raw_text: string;
  language: string;
  duration_ms: number;
  provider: string;
  model: string;
  cleanup_provider: 'upstream' | 'gemini' | 'local';
  filler_removed: number;
  corrections_applied: number;
}

const GEMINI_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';
const GEMINI_CLEANUP_MODEL = 'gemini-4-hydrogen';

export function readBackendConfig(): BackendRuntimeConfig {
  const rawFormat = (process.env.UPSTREAM_TRANSCRIBE_FORMAT ?? 'auto').trim().toLowerCase();
  const upstreamTranscribeFormat: UpstreamTranscribeFormat =
    rawFormat === 'openai' || rawFormat === 'whisper-cpp' ? rawFormat : 'auto';

  return {
    geminiApiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
    upstreamTranscribeUrl: (process.env.UPSTREAM_TRANSCRIBE_URL ?? '').trim(),
    upstreamTranscribeFormat,
    upstreamTranscribeModel: (process.env.UPSTREAM_TRANSCRIBE_MODEL ?? 'whisper-1').trim() || 'whisper-1',
    upstreamTranscribeApiKey: (process.env.UPSTREAM_TRANSCRIBE_API_KEY ?? '').trim(),
    upstreamCleanupUrl: (process.env.UPSTREAM_CLEANUP_URL ?? '').trim(),
    upstreamCleanupModel: (process.env.UPSTREAM_CLEANUP_MODEL ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini',
    upstreamCleanupApiKey: (process.env.UPSTREAM_CLEANUP_API_KEY ?? '').trim(),
    flowApiKey: (process.env.FLOW_API_KEY ?? '').trim(),
  };
}

export function getBackendHealthStatus(): BackendHealthStatus {
  const cfg = readBackendConfig();

  let mode: BackendHealthStatus['mode'] = 'unconfigured';
  let provider = 'none';
  let model = 'none';

  if (cfg.upstreamTranscribeUrl) {
    mode = 'upstream';
    try {
      const resolved = resolveUpstreamTranscribeEndpoint(
        cfg.upstreamTranscribeUrl,
        cfg.upstreamTranscribeFormat
      );
      provider = resolved.protocol === 'whisper-cpp' ? 'whisper-cpp' : 'self-hosted-openai';
      model = cfg.upstreamTranscribeModel;
    } catch {
      provider = 'invalid-upstream-url';
      model = cfg.upstreamTranscribeModel;
    }
  } else if (cfg.geminiApiKey) {
    mode = 'gemini';
    provider = 'gemini';
    model = GEMINI_TRANSCRIBE_MODEL;
  }

  const cleanupProvider: BackendHealthStatus['cleanupProvider'] = cfg.upstreamCleanupUrl
    ? 'upstream'
    : cfg.geminiApiKey
      ? 'gemini'
      : 'local';

  return {
    ok: true,
    status: 'ok',
    mode,
    provider,
    model,
    cleanupProvider,
    authRequired: Boolean(cfg.flowApiKey),
    endpoints: {
      flow: '/transcribe',
      openaiCompatible: '/v1/audio/transcriptions',
      whisperCppCompatible: '/inference',
    },
    timestamp: new Date().toISOString(),
  };
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function transcribeViaUpstream(
  audioBuffer: Buffer,
  mimeType: string,
  req: ParsedTranscribeRequest,
  cfg: BackendRuntimeConfig
): Promise<{ rawText: string; language: string; durationMs?: number; provider: string; model: string }> {
  let resolved: { url: string; protocol: 'openai' | 'whisper-cpp' };
  try {
    resolved = resolveUpstreamTranscribeEndpoint(
      cfg.upstreamTranscribeUrl,
      cfg.upstreamTranscribeFormat
    );
  } catch (err) {
    throw new TranscriptionServiceError(
      err instanceof Error ? err.message : 'Invalid UPSTREAM_TRANSCRIBE_URL configuration.',
      500
    );
  }

  const promptCap = getPromptCharLimit(cfg.upstreamTranscribeModel, resolved.url);
  const dictionaryPrompt = buildDictionaryPrompt(req.dictionary, {
    maxChars: promptCap,
    extraPrompt: req.extraPrompt,
  });

  const ext = extensionForAudioMime(mimeType);
  const fileBlob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  const form = new FormData();
  form.append('file', fileBlob, `dictation.${ext}`);
  form.append('response_format', 'json');

  if (resolved.protocol === 'whisper-cpp') {
    form.append('temperature', '0.0');
    if (req.language && req.language !== 'auto') {
      form.append('language', req.language);
    }
    if (dictionaryPrompt) {
      form.append('prompt', dictionaryPrompt);
    }
  } else {
    form.append('model', cfg.upstreamTranscribeModel);
    if (req.language && req.language !== 'auto') {
      form.append('language', req.language);
    }
    if (dictionaryPrompt) {
      form.append('prompt', dictionaryPrompt);
    }
  }

  const headers: Record<string, string> = {};
  if (cfg.upstreamTranscribeApiKey) {
    headers['Authorization'] = `Bearer ${cfg.upstreamTranscribeApiKey}`;
    headers['X-API-Key'] = cfg.upstreamTranscribeApiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(resolved.url, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new TranscriptionServiceError(
        `Upstream transcription server error (${response.status}): ${errBody.slice(0, 180) || response.statusText}`,
        response.status >= 400 && response.status < 600 ? response.status : 502
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    let rawText = '';
    let detectedLang = req.language;
    let durationMs: number | undefined;

    if (contentType.includes('application/json')) {
      const data = (await response.json()) as {
        text?: string;
        language?: string;
        duration?: number;
        duration_ms?: number;
      };
      rawText = typeof data.text === 'string' ? data.text.trim() : '';
      if (typeof data.language === 'string' && data.language.trim()) {
        detectedLang = data.language.trim();
      }
      if (typeof data.duration_ms === 'number' && data.duration_ms > 0) {
        durationMs = Math.round(data.duration_ms);
      } else if (typeof data.duration === 'number' && data.duration > 0) {
        durationMs = Math.round(data.duration * 1000);
      }
    } else {
      rawText = (await response.text()).trim();
    }

    const filtered = stripDictionaryEcho(rawText, dictionaryPrompt);
    return {
      rawText: filtered,
      language: detectedLang,
      durationMs,
      provider: resolved.protocol === 'whisper-cpp' ? 'whisper-cpp' : 'self-hosted-openai',
      model: cfg.upstreamTranscribeModel,
    };
  } catch (err) {
    if (err instanceof TranscriptionServiceError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TranscriptionServiceError('Upstream transcription request timed out.', 504);
    }
    throw new TranscriptionServiceError(
      `Could not reach upstream transcription server: ${err instanceof Error ? err.message : 'Network error'}`,
      502
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeViaGemini(
  audioBuffer: Buffer,
  mimeType: string,
  req: ParsedTranscribeRequest,
  cfg: BackendRuntimeConfig
): Promise<{ rawText: string; language: string; provider: string; model: string }> {
  const ai = createGeminiClient(cfg.geminiApiKey);
  const dictionaryPrompt = buildDictionaryPrompt(req.dictionary, {
    maxChars: getPromptCharLimit(GEMINI_TRANSCRIBE_MODEL),
    extraPrompt: req.extraPrompt,
  });

  const instructionLines = [
    `Transcribe the spoken audio verbatim in language "${req.language}".`,
    'Output ONLY the spoken transcript text with no timestamps, speaker labels, markdown, or extra commentary.',
    'If the audio contains only silence or non-speech noise, output an empty string.',
  ];
  if (dictionaryPrompt) {
    instructionLines.push(`Domain vocabulary / spellings to recognize accurately: ${dictionaryPrompt}`);
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TRANSCRIBE_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: audioBuffer.toString('base64'),
              mimeType,
            },
          },
          {
            text: instructionLines.join('\n'),
          },
        ],
      },
    });

    const rawText = stripDictionaryEcho((response.text ?? '').trim(), dictionaryPrompt);
    return {
      rawText,
      language: req.language,
      provider: 'gemini',
      model: GEMINI_TRANSCRIBE_MODEL,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini transcription failed';
    throw new TranscriptionServiceError(`Gemini transcription error: ${message}`, 502);
  }
}

async function polishViaUpstreamLlm(
  rawText: string,
  req: ParsedTranscribeRequest,
  cfg: BackendRuntimeConfig
): Promise<string | null> {
  let endpoint: string;
  try {
    endpoint = resolveUpstreamCleanupEndpoint(cfg.upstreamCleanupUrl);
  } catch {
    return null;
  }

  const systemPrompt = buildToneStylePrompt({
    style: req.style,
    context: req.context,
    cleanup: req.cleanup,
    dictionary: req.dictionary,
    language: req.language,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cfg.upstreamCleanupApiKey) {
    headers['Authorization'] = `Bearer ${cfg.upstreamCleanupApiKey}`;
    headers['X-API-Key'] = cfg.upstreamCleanupApiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: cfg.upstreamCleanupModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: rawText },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const cleaned = data.choices?.[0]?.message?.content?.trim();
    if (!cleaned || isDuplicatedCleanupOutput(rawText, cleaned)) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function polishViaGemini(
  rawText: string,
  req: ParsedTranscribeRequest,
  cfg: BackendRuntimeConfig
): Promise<string | null> {
  const ai = createGeminiClient(cfg.geminiApiKey);
  const systemInstruction = buildToneStylePrompt({
    style: req.style,
    context: req.context,
    cleanup: req.cleanup,
    dictionary: req.dictionary,
    language: req.language,
  });

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_CLEANUP_MODEL,
      contents: rawText,
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW,
        },
      },
    });

    const cleaned = (response.text ?? '').trim();
    if (!cleaned || isDuplicatedCleanupOutput(rawText, cleaned)) {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Full 4-stage OpenWhispr-inspired transcription & cleanup service:
 * 1. Audio normalization
 * 2. Transcription (self-hosted Whisper / whisper.cpp OR built-in Gemini 3.5 Transcribe) + dictionary echo filter
 * 3. Deterministic baseline & metrics (filler words, self-corrections, dictionary replacements)
 * 4. Tone/style polish (upstream LLM OR Gemini 4 Hydrogen with duplication guard, falling back to local pipeline)
 */
export async function runTranscriptionPipeline(params: {
  audioBuffer: Buffer;
  rawMimeType?: string;
  request: ParsedTranscribeRequest;
  skipLlmPolish?: boolean;
}): Promise<BackendTranscribeResult> {
  const started = Date.now();
  const cfg = readBackendConfig();
  const mimeType = normalizeAudioMimeType(params.rawMimeType);

  let sttResult: {
    rawText: string;
    language: string;
    durationMs?: number;
    provider: string;
    model: string;
  };

  if (cfg.upstreamTranscribeUrl) {
    sttResult = await transcribeViaUpstream(params.audioBuffer, mimeType, params.request, cfg);
  } else if (cfg.geminiApiKey) {
    sttResult = await transcribeViaGemini(params.audioBuffer, mimeType, params.request, cfg);
  } else {
    throw new TranscriptionServiceError(
      'No transcription backend configured. Set GEMINI_API_KEY or UPSTREAM_TRANSCRIBE_URL in your server environment.',
      503
    );
  }

  const rawText = sttResult.rawText.trim();
  if (!rawText) {
    return {
      text: '',
      raw_text: '',
      language: sttResult.language,
      duration_ms: sttResult.durationMs ?? Math.max(500, Date.now() - started),
      provider: sttResult.provider,
      model: sttResult.model,
      cleanup_provider: 'local',
      filler_removed: 0,
      corrections_applied: 0,
    };
  }

  // Deterministic baseline guarantees reliable metrics & instant fallback
  const localBaseline = applyLocalCleanupPipeline(rawText, {
    style: params.request.style,
    context: params.request.context,
    cleanup: params.request.cleanup,
    dictionary: params.request.dictionary,
  });

  let finalText = localBaseline.text;
  let cleanupProvider: 'upstream' | 'gemini' | 'local' = 'local';

  const shouldPolish =
    !params.skipLlmPolish &&
    (params.request.cleanup.removeFillerWords ||
      params.request.cleanup.applySelfCorrections ||
      params.request.cleanup.autoPunctuation ||
      params.request.cleanup.autoCapitalization);

  if (shouldPolish) {
    let polished: string | null = null;
    if (cfg.upstreamCleanupUrl) {
      polished = await polishViaUpstreamLlm(rawText, params.request, cfg);
      if (polished) cleanupProvider = 'upstream';
    } else if (cfg.geminiApiKey) {
      polished = await polishViaGemini(rawText, params.request, cfg);
      if (polished) cleanupProvider = 'gemini';
    }

    if (polished) {
      // Ensure explicit personal dictionary replacements are always honored even if LLM skipped one
      const dictEnforced = applyLocalCleanupPipeline(polished, {
        style: params.request.style,
        context: params.request.context,
        cleanup: {
          removeFillerWords: false,
          applySelfCorrections: false,
          autoPunctuation: false,
          autoCapitalization: false,
        },
        dictionary: params.request.dictionary,
      });
      finalText = dictEnforced.text || polished;
    }
  }

  return {
    text: finalText,
    raw_text: rawText,
    language: sttResult.language,
    duration_ms: sttResult.durationMs ?? Math.max(500, Date.now() - started),
    provider: sttResult.provider,
    model: sttResult.model,
    cleanup_provider: cleanupProvider,
    filler_removed: localBaseline.fillerRemovedCount,
    corrections_applied: localBaseline.correctionsAppliedCount,
  };
}
