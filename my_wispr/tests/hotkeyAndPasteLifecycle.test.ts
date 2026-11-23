import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HANDS_FREE_HOTKEY,
  DEFAULT_PTT_HOTKEY,
  formatHotkeyBinding,
  matchesHotkeyDown,
  matchesHotkeyRelease,
} from '../src/services/hotkeys.js';
import {
  checkOpenAICompatibleHealth,
  cleanWithSelfHostedLLM,
  getDefaultServerUrl,
  LIVE_SEAMLESS_SERVER_URL,
  normalizeOpenAiBaseUrl,
} from '../src/services/api.js';
import { deriveWebSocketUrl } from '../src/utils/pcmAudio.js';

test('Default server URL points to dedicated cloud VM', () => {
  const url = getDefaultServerUrl();
  assert.equal(url, 'https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech');
  assert.equal(url, LIVE_SEAMLESS_SERVER_URL);
});

test('Derives WebSocket transcription endpoint from cloud base URL', () => {
  const wsUrl = deriveWebSocketUrl('https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech');
  assert.equal(
    wsUrl,
    'wss://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech/api/v1/meetings/transcribe'
  );
});

test('Hotkey defaults match Ctrl + Alt + Space and fn', () => {
  assert.equal(formatHotkeyBinding(DEFAULT_HANDS_FREE_HOTKEY), 'Ctrl + Alt + Space');
  assert.equal(DEFAULT_HANDS_FREE_HOTKEY.code, 'Space');
  assert.equal(DEFAULT_HANDS_FREE_HOTKEY.ctrl, true);
  assert.equal(DEFAULT_HANDS_FREE_HOTKEY.alt, true);

  assert.equal(DEFAULT_PTT_HOTKEY.code, 'Fn');
  assert.equal(formatHotkeyBinding(DEFAULT_PTT_HOTKEY), 'fn');
});

test('Matches hands-free keydown (Ctrl + Alt + Space) and rejects partial modifiers', () => {
  const handsFreeDown = matchesHotkeyDown(
    {
      code: 'Space',
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false,
    },
    DEFAULT_HANDS_FREE_HOTKEY
  );
  assert.equal(handsFreeDown, true);

  // Missing Alt should reject
  const missingAlt = matchesHotkeyDown(
    {
      code: 'Space',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    },
    DEFAULT_HANDS_FREE_HOTKEY
  );
  assert.equal(missingAlt, false);
});

test('Matches push-to-talk keydown and keyup for fn / solo modifier', () => {
  const pttBinding = { code: 'ControlRight', label: 'Right Ctrl' };
  const pttDown = matchesHotkeyDown(
    {
      code: 'ControlRight',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    },
    pttBinding
  );
  assert.equal(pttDown, true);

  const pttUp = matchesHotkeyRelease(
    {
      code: 'ControlRight',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    },
    pttBinding
  );
  assert.equal(pttUp, true);
});

test('Normalizes self-hosted OpenAI-compatible URLs cleanly', () => {
  assert.equal(
    normalizeOpenAiBaseUrl('http://192.168.1.126:11434'),
    'http://192.168.1.126:11434/v1'
  );
  assert.equal(
    normalizeOpenAiBaseUrl('http://192.168.1.126:11434/v1'),
    'http://192.168.1.126:11434/v1'
  );
  assert.equal(
    normalizeOpenAiBaseUrl('http://192.168.1.126:11434/v1/'),
    'http://192.168.1.126:11434/v1'
  );
});
