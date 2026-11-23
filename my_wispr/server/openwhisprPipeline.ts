import crypto from 'node:crypto';
import type {
  AutoCleanupConfig,
  DictionaryEntry,
  StyleContext,
  StylePreset,
} from '../src/types.ts';

/**
 * Character caps ported from OpenWhispr's `dictionaryPromptCap.js` so Whisper-family
 * decoder prompt windows (223 tokens) are never truncated or rejected by upstream servers.
 */
export const WHISPER_PROMPT_CHARS = 900;
export const GROQ_PROMPT_CHARS = 890;
export const TRANSCRIBE_PROMPT_CHARS = 8000;

export type UpstreamTranscribeFormat = 'auto' | 'openai' | 'whisper-cpp';

export interface MinimalDictionaryItem {
  type: 'word' | 'replacement';
  trigger: string;
  replacement?: string | null;
}

export interface ParsedTranscribeRequest {
  style: StylePreset;
  context: StyleContext;
  language: string;
  cleanup: AutoCleanupConfig;
  dictionary: DictionaryEntry[];
  extraPrompt?: string;
}

const VALID_STYLES = new Set<StylePreset>(['standard', 'formal', 'casual', 'very_casual']);
const VALID_CONTEXTS = new Set<StyleContext>(['personal', 'work', 'email', 'other']);

const DEFAULT_CLEANUP: AutoCleanupConfig = {
  removeFillerWords: true,
  applySelfCorrections: true,
  autoPunctuation: true,
  autoCapitalization: true,
};

const BLOCKED_METADATA_HOSTS = new Set([
  '169.254.169.254',
  '169.254.170.2',
  'metadata.google.internal',
  'metadata.goog',
  'fd00:ec2::254',
  '[fd00:ec2::254]',
]);

/**
 * Determines the safe prompt character budget for a given transcription model / endpoint,
 * mirroring OpenWhispr's `getPromptCharLimit`.
 */
export function getPromptCharLimit(model = '', endpointUrl = ''): number {
  const m = model.toLowerCase();
  const url = endpointUrl.toLowerCase();
  if (url.includes('groq.com')) {
    return GROQ_PROMPT_CHARS;
  }
  if (m.includes('gpt-4o') || m.includes('gemini')) {
    return TRANSCRIBE_PROMPT_CHARS;
  }
  return WHISPER_PROMPT_CHARS;
}

/**
 * Builds a comma-separated Whisper / STT prompt from Flow dictionary entries,
 * capping output cleanly at the target character limit without cutting words mid-token.
 */
export function buildDictionaryPrompt(
  entries: MinimalDictionaryItem[],
  options?: { maxChars?: number; extraPrompt?: string }
): string {
  const maxChars = options?.maxChars ?? WHISPER_PROMPT_CHARS;
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const entry of entries) {
    const candidates =
      entry.type === 'replacement' && entry.replacement?.trim()
        ? [entry.replacement.trim(), entry.trigger.trim()]
        : [entry.trigger.trim()];

    for (const raw of candidates) {
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(raw);
    }
  }

  const base = options?.extraPrompt?.trim() ?? '';
  let result = base;

  for (const term of terms) {
    const separator = result ? ', ' : '';
    if (result.length + separator.length + term.length > maxChars) {
      break;
    }
    result += separator + term;
  }

  return result.slice(0, maxChars).trim();
}

function normalizeEchoWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Ported from OpenWhispr's `dictionaryEchoFilter.js`.
 * When an audio clip is mostly silence, Whisper-family models frequently recite
 * the injected dictionary prompt verbatim. This detects and strips full or trailing
 * dictionary echoes while preserving real speech.
 */
export function stripDictionaryEcho(transcript: string, dictionaryPrompt: string): string {
  const trimmed = transcript.trim();
  const prompt = dictionaryPrompt.trim();
  if (!trimmed || !prompt) return trimmed;

  const dictWords = normalizeEchoWords(prompt);
  if (dictWords.length === 0) return trimmed;

  const transcriptWords = normalizeEchoWords(trimmed);
  if (transcriptWords.length === 0) return '';

  const dictSet = new Set(dictWords);

  // 1. Exact or near-exact full recital of dictionary terms
  const matchedInTranscript = transcriptWords.filter((w) => dictSet.has(w)).length;
  const matchRatio = matchedInTranscript / transcriptWords.length;

  // If the transcript has >= 2 words and >= 85% of them come straight from the dictionary
  // prompt (or exact case-insensitive substring of the dictionary prompt), treat as echo.
  const normTranscript = transcriptWords.join(' ');
  const normPrompt = dictWords.join(' ');
  if (
    (transcriptWords.length >= 2 && normPrompt.includes(normTranscript)) ||
    (transcriptWords.length >= 3 && matchRatio >= 0.85)
  ) {
    return '';
  }

  // 2. Trailing echo: real speech followed by a comma-separated chunk of >= 3 dictionary words
  const sentences = trimmed.split(/(?<=[.!?])\s+|\s*,\s*/);
  if (sentences.length >= 4) {
    let tailDictChunks = 0;
    for (let i = sentences.length - 1; i >= 0; i -= 1) {
      const chunkWords = normalizeEchoWords(sentences[i]);
      if (chunkWords.length > 0 && chunkWords.every((w) => dictSet.has(w))) {
        tailDictChunks += 1;
      } else {
        break;
      }
    }
    if (tailDictChunks >= 3 && tailDictChunks < sentences.length) {
      const kept = sentences.slice(0, sentences.length - tailDictChunks).join(', ').trim();
      return kept;
    }
  }

  return trimmed;
}

/**
 * Ported from OpenWhispr's `cleanupOutput.ts`.
 * Guards against LLM post-processing hallucinating a doubled copy of the transcript.
 */
export function isDuplicatedCleanupOutput(rawText: string, cleanedText: string): boolean {
  const rawWords = normalizeEchoWords(rawText);
  const outWords = normalizeEchoWords(cleanedText);

  if (rawWords.length < 4 || outWords.length < rawWords.length * 1.75) {
    return false;
  }

  // Check if the output looks like two near-identical halves back-to-back
  const half = Math.floor(outWords.length / 2);
  const firstHalf = outWords.slice(0, half).join(' ');
  const secondHalf = outWords.slice(half, half * 2).join(' ');
  if (firstHalf.length > 10 && firstHalf === secondHalf) {
    return true;
  }

  // Check if rawText appears twice inside cleanedText
  const rawNorm = rawWords.join(' ');
  const outNorm = outWords.join(' ');
  const firstIdx = outNorm.indexOf(rawNorm);
  if (firstIdx !== -1 && outNorm.indexOf(rawNorm, firstIdx + rawNorm.length) !== -1) {
    return true;
  }

  return false;
}

/**
 * Ported from OpenWhispr's `toneStyle.ts` and aligned with Flow's Style & Auto Cleanup UI.
 * Produces a concise system prompt for optional LLM cleanup/polishing.
 */
export function buildToneStylePrompt(options: {
  style: StylePreset;
  context: StyleContext;
  cleanup: AutoCleanupConfig;
  dictionary: DictionaryEntry[];
  language?: string;
}): string {
  const { style, context, cleanup, dictionary, language = 'en' } = options;

  const contextLabel: Record<StyleContext, string> = {
    personal: 'personal chat message',
    work: 'work team chat message (e.g. Slack/Teams)',
    email: 'email',
    other: 'general writing',
  };

  const styleRules: Record<StylePreset, string> = {
    standard:
      'Tone: Standard clean prose. Use clear natural phrasing, accurate punctuation, and standard capitalization without changing the speaker meaning.',
    formal:
      'Tone: Formal (Caps + Punctuation). Use standard capitalization, complete sentences, clear punctuation, and polished professional phrasing without changing the speaker meaning.',
    casual:
      'Tone: Casual (Caps + Less punctuation). Keep normal sentence capitalization, keep phrasing relaxed and natural, and omit unnecessary trailing periods or stiff greeting commas.',
    very_casual:
      'Tone: Very casual (No caps + Less punctuation). Use mostly lowercase sentence starters and minimal punctuation (keep question marks when needed, drop trailing periods).',
  };

  const cleanupRules: string[] = [];
  if (cleanup.removeFillerWords) {
    cleanupRules.push('- Remove verbal fillers (um, uh, er, ah, you know, I mean) and false starts.');
  } else {
    cleanupRules.push('- Keep spoken filler words intact.');
  }
  if (cleanup.applySelfCorrections) {
    cleanupRules.push(
      '- Resolve spoken self-corrections (e.g. "Thursday, actually no Friday" -> "Friday") and remove immediate word stutters ("the the" -> "the").'
    );
  } else {
    cleanupRules.push('- Do not rewrite spoken self-corrections.');
  }
  if (cleanup.autoPunctuation) {
    cleanupRules.push('- Add natural punctuation and question marks appropriate to the selected tone.');
  } else {
    cleanupRules.push('- Avoid adding extra punctuation.');
  }
  if (cleanup.autoCapitalization && style !== 'very_casual') {
    cleanupRules.push('- Apply proper sentence and pronoun capitalization.');
  } else {
    cleanupRules.push('- Keep lowercase sentence starts unless required by proper nouns/dictionary.');
  }

  const dictWords = dictionary
    .filter((d) => d.type === 'word' && d.trigger.trim())
    .map((d) => d.trigger.trim())
    .slice(0, 60);

  const dictReplacements = dictionary
    .filter((d) => d.type === 'replacement' && d.trigger.trim() && d.replacement?.trim())
    .map((d) => `"${d.trigger.trim()}" -> "${d.replacement!.trim()}"`)
    .slice(0, 60);

  const dictLines: string[] = [];
  if (dictWords.length > 0) {
    dictLines.push(`Exact spellings to preserve: ${dictWords.join(', ')}.`);
  }
  if (dictReplacements.length > 0) {
    dictLines.push(`Required replacements: ${dictReplacements.join('; ')}.`);
  }

  const lines = [
    `You are a speech-to-text dictation cleaner for a ${contextLabel[context]} (language: ${language}).`,
    'Return ONLY the cleaned dictation text with no commentary, quotes, markdown fences, or preamble.',
    'Priority rules: Never invent new facts, never drop substantive information, and never duplicate the transcript.',
    language.toLowerCase().startsWith('en')
      ? styleRules[style]
      : 'Preserve the original spoken language; only apply basic cleanup.',
    'Cleanup directives:',
    ...cleanupRules,
  ];

  if (dictLines.length > 0) {
    lines.push('Personal dictionary:', ...dictLines);
  }

  return lines.join('\n');
}

/**
 * Validates and resolves an upstream self-hosted transcription endpoint URL,
 * modeled on OpenWhispr's `transcriptionRoute.ts` and `selfHostedTranscription.js`.
 *
 * Supports:
 * - OpenAI-compatible servers (Faster-Whisper, Speaches, LocalAI, Groq, OpenAI):
 *     `https://host` -> `https://host/v1/audio/transcriptions`
 *     `https://host/v1` -> `https://host/v1/audio/transcriptions`
 *     `https://host/v1/audio/transcriptions` -> unchanged
 * - whisper.cpp server (`format: 'whisper-cpp'` or URL ending with `/inference`):
 *     `http://127.0.0.1:8080` -> `http://127.0.0.1:8080/inference`
 *     `http://127.0.0.1:8080/inference` -> unchanged
 */
export function resolveUpstreamTranscribeEndpoint(
  rawUrl: string,
  format: UpstreamTranscribeFormat = 'auto'
): { url: string; protocol: 'openai' | 'whisper-cpp' } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Upstream transcription URL is empty.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Upstream transcription URL must be a valid http:// or https:// URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported upstream URL protocol "${parsed.protocol}". Use http:// or https://.`);
  }

  const hostLower = parsed.hostname.toLowerCase();
  if (BLOCKED_METADATA_HOSTS.has(hostLower)) {
    throw new Error('Blocked cloud metadata endpoint in upstream URL.');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  const inferredProtocol: 'openai' | 'whisper-cpp' =
    format === 'whisper-cpp' || (format === 'auto' && normalizedPath.endsWith('/inference'))
      ? 'whisper-cpp'
      : 'openai';

  if (inferredProtocol === 'whisper-cpp') {
    if (!normalizedPath.endsWith('/inference')) {
      parsed.pathname = `${normalizedPath}/inference`;
    } else {
      parsed.pathname = normalizedPath;
    }
    return { url: parsed.toString(), protocol: 'whisper-cpp' };
  }

  // OpenAI-compatible transcription endpoint resolution
  if (normalizedPath.endsWith('/audio/transcriptions')) {
    parsed.pathname = normalizedPath;
  } else if (normalizedPath.endsWith('/v1')) {
    parsed.pathname = `${normalizedPath}/audio/transcriptions`;
  } else if (normalizedPath === '' || normalizedPath === '/') {
    parsed.pathname = '/v1/audio/transcriptions';
  } else {
    parsed.pathname = `${normalizedPath}/audio/transcriptions`;
  }

  return { url: parsed.toString(), protocol: 'openai' };
}

/**
 * Resolves an OpenAI-compatible `/chat/completions` cleanup endpoint URL.
 */
export function resolveUpstreamCleanupEndpoint(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Upstream cleanup URL is empty.');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Upstream cleanup URL must be a valid http:// or https:// URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported cleanup URL protocol "${parsed.protocol}".`);
  }

  if (BLOCKED_METADATA_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Blocked cloud metadata endpoint in upstream cleanup URL.');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  if (normalizedPath.endsWith('/chat/completions')) {
    parsed.pathname = normalizedPath;
  } else if (normalizedPath.endsWith('/v1')) {
    parsed.pathname = `${normalizedPath}/chat/completions`;
  } else if (normalizedPath === '' || normalizedPath === '/') {
    parsed.pathname = '/v1/chat/completions';
  } else {
    parsed.pathname = `${normalizedPath}/chat/completions`;
  }

  return parsed.toString();
}

/**
 * Normalizes audio MIME types for Gemini & upstream Whisper servers:
 * strips `;codecs=...` parameters and normalizes aliases (`audio/mpeg` -> `audio/mp3`, `audio/mp4` -> `audio/aac`).
 */
export function normalizeAudioMimeType(rawMime?: string | null): string {
  const base = (rawMime ?? 'audio/webm').split(';')[0].trim().toLowerCase();
  if (!base || base === 'application/octet-stream') return 'audio/webm';
  if (base === 'audio/mpeg' || base === 'audio/mpga') return 'audio/mp3';
  if (base === 'audio/mp4' || base === 'audio/m4a' || base === 'audio/x-m4a') return 'audio/aac';
  if (base === 'audio/x-wav' || base === 'audio/wave') return 'audio/wav';
  if (base === 'video/webm') return 'audio/webm';
  return base;
}

export function extensionForAudioMime(mimeType: string): string {
  const norm = normalizeAudioMimeType(mimeType);
  if (norm === 'audio/wav') return 'wav';
  if (norm === 'audio/mp3') return 'mp3';
  if (norm === 'audio/ogg') return 'ogg';
  if (norm === 'audio/flac') return 'flac';
  if (norm === 'audio/aac') return 'm4a';
  return 'webm';
}

/**
 * Validates and parses multipart body fields from Flow's `POST /transcribe`
 * (or OpenAI-compatible `POST /v1/audio/transcriptions`).
 */
export function parseTranscribeRequestFields(
  body: Record<string, unknown> | undefined
): ParsedTranscribeRequest {
  const safeBody = body ?? {};

  const rawStyle = typeof safeBody.style === 'string' ? safeBody.style.trim() : 'formal';
  const style: StylePreset = VALID_STYLES.has(rawStyle as StylePreset)
    ? (rawStyle as StylePreset)
    : 'formal';

  const rawContext = typeof safeBody.context === 'string' ? safeBody.context.trim() : 'work';
  const context: StyleContext = VALID_CONTEXTS.has(rawContext as StyleContext)
    ? (rawContext as StyleContext)
    : 'work';

  const rawLanguage = typeof safeBody.language === 'string' ? safeBody.language.trim() : 'en';
  const language = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,4})?$/.test(rawLanguage) ? rawLanguage : 'en';

  let cleanup: AutoCleanupConfig = { ...DEFAULT_CLEANUP };
  if (typeof safeBody.cleanup === 'string' && safeBody.cleanup.trim()) {
    try {
      const parsed = JSON.parse(safeBody.cleanup);
      if (parsed && typeof parsed === 'object') {
        cleanup = {
          removeFillerWords:
            typeof parsed.removeFillerWords === 'boolean'
              ? parsed.removeFillerWords
              : DEFAULT_CLEANUP.removeFillerWords,
          applySelfCorrections:
            typeof parsed.applySelfCorrections === 'boolean'
              ? parsed.applySelfCorrections
              : DEFAULT_CLEANUP.applySelfCorrections,
          autoPunctuation:
            typeof parsed.autoPunctuation === 'boolean'
              ? parsed.autoPunctuation
              : DEFAULT_CLEANUP.autoPunctuation,
          autoCapitalization:
            typeof parsed.autoCapitalization === 'boolean'
              ? parsed.autoCapitalization
              : DEFAULT_CLEANUP.autoCapitalization,
        };
      }
    } catch {
      // Keep defaults on malformed JSON
    }
  } else if (safeBody.cleanup && typeof safeBody.cleanup === 'object') {
    const obj = safeBody.cleanup as Partial<AutoCleanupConfig>;
    cleanup = {
      removeFillerWords: obj.removeFillerWords ?? DEFAULT_CLEANUP.removeFillerWords,
      applySelfCorrections: obj.applySelfCorrections ?? DEFAULT_CLEANUP.applySelfCorrections,
      autoPunctuation: obj.autoPunctuation ?? DEFAULT_CLEANUP.autoPunctuation,
      autoCapitalization: obj.autoCapitalization ?? DEFAULT_CLEANUP.autoCapitalization,
    };
  }

  const dictionary: DictionaryEntry[] = [];
  let rawDict: unknown = safeBody.dictionary;
  if (typeof rawDict === 'string' && rawDict.trim()) {
    try {
      rawDict = JSON.parse(rawDict);
    } catch {
      rawDict = [];
    }
  }

  if (Array.isArray(rawDict)) {
    const capped = rawDict.slice(0, 500);
    for (let i = 0; i < capped.length; i += 1) {
      const item = capped[i];
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const trigger = typeof rec.trigger === 'string' ? rec.trigger.trim().slice(0, 120) : '';
      if (!trigger) continue;
      const replacement =
        typeof rec.replacement === 'string' ? rec.replacement.trim().slice(0, 200) : undefined;
      const type: 'word' | 'replacement' =
        rec.type === 'replacement' && replacement ? 'replacement' : 'word';
      dictionary.push({
        id: `req-dict-${i}`,
        type,
        trigger,
        replacement: type === 'replacement' ? replacement : undefined,
        starred: false,
        scope: 'personal',
        createdAt: 0,
      });
    }
  }

  const extraPrompt =
    typeof safeBody.prompt === 'string' ? safeBody.prompt.trim().slice(0, 1000) : undefined;

  return {
    style,
    context,
    language,
    cleanup,
    dictionary,
    extraPrompt,
  };
}

/**
 * Constant-time API key verification supporting both `X-API-Key` and `Authorization: Bearer <key>`.
 */
export function isAuthorizedApiKey(
  expectedKey: string | undefined,
  headers: { apiKeyHeader?: string; authorizationHeader?: string }
): boolean {
  const expected = expectedKey?.trim();
  if (!expected) return true;

  const candidates: string[] = [];
  if (headers.apiKeyHeader?.trim()) {
    candidates.push(headers.apiKeyHeader.trim());
  }
  if (headers.authorizationHeader?.trim()) {
    const auth = headers.authorizationHeader.trim();
    if (/^bearer\s+/i.test(auth)) {
      candidates.push(auth.replace(/^bearer\s+/i, '').trim());
    } else {
      candidates.push(auth);
    }
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  for (const candidate of candidates) {
    const candBuf = Buffer.from(candidate, 'utf8');
    if (candBuf.length === expectedBuf.length && crypto.timingSafeEqual(candBuf, expectedBuf)) {
      return true;
    }
  }

  return false;
}
