import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GROQ_PROMPT_CHARS,
  TRANSCRIBE_PROMPT_CHARS,
  WHISPER_PROMPT_CHARS,
  buildDictionaryPrompt,
  buildToneStylePrompt,
  extensionForAudioMime,
  getPromptCharLimit,
  isAuthorizedApiKey,
  isDuplicatedCleanupOutput,
  normalizeAudioMimeType,
  parseTranscribeRequestFields,
  resolveUpstreamCleanupEndpoint,
  resolveUpstreamTranscribeEndpoint,
  stripDictionaryEcho,
} from './openwhisprPipeline.ts';

describe('openwhisprPipeline — dictionary prompt & echo filter', () => {
  it('caps dictionary prompt cleanly within Whisper budget and deduplicates terms', () => {
    const prompt = buildDictionaryPrompt([
      { type: 'word', trigger: 'Wispr Flow' },
      { type: 'replacement', trigger: 'btw', replacement: 'by the way' },
      { type: 'word', trigger: 'wispr flow' },
    ]);
    assert.equal(prompt, 'Wispr Flow, by the way, btw');
    assert.ok(prompt.length <= WHISPER_PROMPT_CHARS);

    const capped = buildDictionaryPrompt(
      Array.from({ length: 80 }, (_, i) => ({ type: 'word', trigger: `CustomTermNumber${i}` })),
      { maxChars: 60 }
    );
    assert.ok(capped.length <= 60);
    assert.ok(!capped.endsWith(','));
  });

  it('selects model/endpoint-appropriate prompt character caps', () => {
    assert.equal(getPromptCharLimit('whisper-1', 'https://api.groq.com/openai/v1'), GROQ_PROMPT_CHARS);
    assert.equal(getPromptCharLimit('gpt-4o-transcribe', 'https://api.openai.com/v1'), TRANSCRIBE_PROMPT_CHARS);
    assert.equal(getPromptCharLimit('gemini-3.5-transcribe', ''), TRANSCRIBE_PROMPT_CHARS);
    assert.equal(getPromptCharLimit('whisper-large-v3', 'http://localhost:8000'), WHISPER_PROMPT_CHARS);
  });

  it('strips full silence-induced dictionary echoes while preserving real dictation', () => {
    const dictPrompt = 'Stewart Gauld, Wispr Flow, stewart@syndeo.co.nz, by the way';
    assert.equal(stripDictionaryEcho('Stewart Gauld, Wispr Flow, by the way', dictPrompt), '');
    assert.equal(
      stripDictionaryEcho('Please send the report to Stewart Gauld by Friday.', dictPrompt),
      'Please send the report to Stewart Gauld by Friday.'
    );
  });

  it('strips trailing dictionary recitals appended after real speech', () => {
    const dictPrompt = 'Stewart, Wispr Flow, Syndeo, Wayland';
    const input = 'Let us ship this build tomorrow, Stewart, Wispr Flow, Syndeo, Wayland';
    assert.equal(stripDictionaryEcho(input, dictPrompt), 'Let us ship this build tomorrow');
  });
});

describe('openwhisprPipeline — cleanup duplication guard & tone prompt', () => {
  it('detects doubled cleanup output and ignores normal cleanup', () => {
    const raw = 'send the report to Sarah by Friday and let her know it is ready';
    const doubled =
      'Send the report to Sarah by Friday and let her know it is ready. Send the report to Sarah by Friday and let her know it is ready.';
    assert.equal(isDuplicatedCleanupOutput(raw, doubled), true);
    assert.equal(
      isDuplicatedCleanupOutput(raw, 'Send the report to Sarah by Friday and let her know it is ready.'),
      false
    );
  });

  it('builds tone style prompt reflecting style preset, cleanup toggles, and dictionary', () => {
    const prompt = buildToneStylePrompt({
      style: 'very_casual',
      context: 'personal',
      cleanup: {
        removeFillerWords: true,
        applySelfCorrections: true,
        autoPunctuation: true,
        autoCapitalization: false,
      },
      dictionary: [
        { id: '1', type: 'word', trigger: 'Wayland', starred: false, scope: 'personal', createdAt: 0 },
        {
          id: '2',
          type: 'replacement',
          trigger: 'btw',
          replacement: 'by the way',
          starred: false,
          scope: 'personal',
          createdAt: 0,
        },
      ],
      language: 'en',
    });

    assert.match(prompt, /Very casual/i);
    assert.match(prompt, /Wayland/);
    assert.match(prompt, /"btw" -> "by the way"/);
    assert.match(prompt, /self-corrections/i);
  });
});

describe('openwhisprPipeline — self-hosted endpoint resolution & security', () => {
  it('resolves OpenAI-compatible self-hosted URLs cleanly without double paths', () => {
    assert.deepEqual(resolveUpstreamTranscribeEndpoint('http://localhost:8000', 'auto'), {
      url: 'http://localhost:8000/v1/audio/transcriptions',
      protocol: 'openai',
    });
    assert.deepEqual(resolveUpstreamTranscribeEndpoint('https://stt.mybox.dev/v1/', 'openai'), {
      url: 'https://stt.mybox.dev/v1/audio/transcriptions',
      protocol: 'openai',
    });
    assert.deepEqual(
      resolveUpstreamTranscribeEndpoint('https://stt.mybox.dev/v1/audio/transcriptions', 'auto'),
      {
        url: 'https://stt.mybox.dev/v1/audio/transcriptions',
        protocol: 'openai',
      }
    );
  });

  it('resolves whisper.cpp /inference endpoints', () => {
    assert.deepEqual(resolveUpstreamTranscribeEndpoint('http://127.0.0.1:8080', 'whisper-cpp'), {
      url: 'http://127.0.0.1:8080/inference',
      protocol: 'whisper-cpp',
    });
    assert.deepEqual(resolveUpstreamTranscribeEndpoint('http://127.0.0.1:8080/inference', 'auto'), {
      url: 'http://127.0.0.1:8080/inference',
      protocol: 'whisper-cpp',
    });
  });

  it('rejects non-http schemes and cloud metadata endpoints', () => {
    assert.throws(() => resolveUpstreamTranscribeEndpoint('file:///etc/passwd'));
    assert.throws(() => resolveUpstreamTranscribeEndpoint('http://169.254.169.254/latest/meta-data'));
    assert.throws(() => resolveUpstreamCleanupEndpoint('http://metadata.google.internal/computeMetadata'));
  });

  it('resolves upstream cleanup endpoints', () => {
    assert.equal(
      resolveUpstreamCleanupEndpoint('http://localhost:11434/v1'),
      'http://localhost:11434/v1/chat/completions'
    );
  });
});

describe('openwhisprPipeline — MIME normalization, request parsing & auth', () => {
  it('normalizes browser MediaRecorder MIME types and extensions', () => {
    assert.equal(normalizeAudioMimeType('audio/webm;codecs=opus'), 'audio/webm');
    assert.equal(normalizeAudioMimeType('audio/mpeg'), 'audio/mp3');
    assert.equal(normalizeAudioMimeType('audio/mp4'), 'audio/aac');
    assert.equal(extensionForAudioMime('audio/webm;codecs=opus'), 'webm');
    assert.equal(extensionForAudioMime('audio/wav'), 'wav');
  });

  it('validates and sanitizes multipart request fields', () => {
    const parsed = parseTranscribeRequestFields({
      style: 'casual',
      context: 'email',
      language: 'en',
      cleanup: JSON.stringify({ removeFillerWords: false, autoPunctuation: true }),
      dictionary: JSON.stringify([
        { type: 'replacement', trigger: 'btw', replacement: 'by the way' },
        { type: 'word', trigger: 'Ubuntu' },
        { type: 'word', trigger: '   ' },
      ]),
    });

    assert.equal(parsed.style, 'casual');
    assert.equal(parsed.context, 'email');
    assert.equal(parsed.cleanup.removeFillerWords, false);
    assert.equal(parsed.cleanup.applySelfCorrections, true);
    assert.equal(parsed.dictionary.length, 2);
    assert.equal(parsed.dictionary[0].replacement, 'by the way');
  });

  it('verifies API keys in constant time via X-API-Key or Bearer header', () => {
    assert.equal(isAuthorizedApiKey(undefined, {}), true);
    assert.equal(isAuthorizedApiKey('secret-token-123', { apiKeyHeader: 'secret-token-123' }), true);
    assert.equal(
      isAuthorizedApiKey('secret-token-123', { authorizationHeader: 'Bearer secret-token-123' }),
      true
    );
    assert.equal(isAuthorizedApiKey('secret-token-123', { apiKeyHeader: 'wrong' }), false);
    assert.equal(isAuthorizedApiKey('secret-token-123', {}), false);
  });
});
