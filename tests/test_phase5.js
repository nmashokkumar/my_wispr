/**
 * Automated Verification Suite for Phase 5:
 * Tests Wispr Hub Window (History Timeline, Audio Playback & Re-Transcribe,
 * Presets, Custom Dictionary, and Cloud Server Settings).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..', 'client');

async function runTests() {
  console.log('--- Starting Phase 5 Wispr Hub Window Verification ---');

  // Test 1: File Existence
  const hubHtml = path.join(CLIENT_DIR, 'src', 'renderer', 'hub', 'index.html');
  const hubCss = path.join(CLIENT_DIR, 'src', 'renderer', 'hub', 'style.css');
  const hubJs = path.join(CLIENT_DIR, 'src', 'renderer', 'hub', 'hub.js');
  const hubWindowJs = path.join(CLIENT_DIR, 'src', 'main', 'hubWindow.js');
  const preloadHubJs = path.join(CLIENT_DIR, 'src', 'main', 'preloadHub.js');

  assert.ok(fs.existsSync(hubHtml), 'hub/index.html must exist');
  assert.ok(fs.existsSync(hubCss), 'hub/style.css must exist');
  assert.ok(fs.existsSync(hubJs), 'hub/hub.js must exist');
  assert.ok(fs.existsSync(hubWindowJs), 'hubWindow.js must exist');
  assert.ok(fs.existsSync(preloadHubJs), 'preloadHub.js must exist');

  // Test 2: HTML DOM Structure Validation
  console.log('Validating Hub HTML structure...');
  const html = fs.readFileSync(hubHtml, 'utf8');
  assert.ok(html.includes('data-tab="history"'), 'History tab button must exist');
  assert.ok(html.includes('data-tab="presets"'), 'Presets tab button must exist');
  assert.ok(html.includes('data-tab="dictionary"'), 'Dictionary tab button must exist');
  assert.ok(html.includes('data-tab="settings"'), 'Settings tab button must exist');
  assert.ok(html.includes('id="history-list"'), 'History list container must exist');
  assert.ok(html.includes('id="presets-list"'), 'Presets list container must exist');
  assert.ok(html.includes('id="dictionary-list"'), 'Dictionary list container must exist');
  assert.ok(html.includes('id="cfg-server-url"'), 'Server URL input must exist');
  assert.ok(html.includes('id="cfg-ws-url"'), 'WebSocket URL input must exist');

  // Test 3: CSS Theme Validation
  console.log('Validating Hub CSS styles...');
  const css = fs.readFileSync(hubCss, 'utf8');
  assert.ok(css.includes('--bg-primary: #09090b'), 'Dark primary background variable must exist');
  assert.ok(css.includes('--brand-cyan: #38bdf8'), 'Brand cyan variable must exist');
  assert.ok(css.includes('.history-card'), 'History card styling must exist');
  assert.ok(css.includes('.dict-chip'), 'Dictionary chip styling must exist');

  // Test 4: HubController Logic Simulation
  console.log('Validating HubController behavior & data binding...');
  const { HubController } = require(hubJs);

  // Mock API and DOM
  const mockHistoryData = [
    {
      transcriptEntityId: 'uuid-1',
      asrText: 'first recording',
      formattedText: 'First recording.',
      numWords: 2,
      timestamp: new Date().toISOString(),
      hasAudio: true,
      status: 'success',
      app: 'Slack'
    },
    {
      transcriptEntityId: 'uuid-2',
      asrText: '',
      formattedText: '',
      numWords: 0,
      timestamp: new Date().toISOString(),
      hasAudio: true,
      status: 'error',
      app: 'Chrome'
    }
  ];

  let retranscribeCalledWith = null;

  const mockApi = {
    getHistory: async () => mockHistoryData,
    getRecordingAudio: async (id) => ({ audio: Buffer.from('fake-audio'), duration: 1000 }),
    retranscribe: async (id) => {
      retranscribeCalledWith = id;
      return { ok: true, formattedText: 'Recovered audio text.', numWords: 3 };
    },
    getPresets: async () => [],
    getDictionary: async () => [{ phrase: 'Antigravity', frequencyUsed: 5 }],
    addDictionaryWord: async (w) => {},
    removeDictionaryWord: async (w) => {},
    getConfig: async () => ({
      server: { api_base_url: 'http://my-vps:8000', websocket_url: 'ws://my-vps:8000/ws' }
    }),
    saveConfig: async (cfg) => {}
  };

  const createMockElem = (id) => ({
    id,
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); }
    },
    style: {},
    innerHTML: '',
    value: '',
    querySelectorAll: () => [],
    addEventListener: () => {}
  });

  const domStore = {
    'history-list': createMockElem('history-list'),
    'presets-list': createMockElem('presets-list'),
    'dictionary-list': createMockElem('dictionary-list'),
    'cfg-server-url': createMockElem('cfg-server-url'),
    'cfg-ws-url': createMockElem('cfg-ws-url'),
    'cfg-api-key': createMockElem('cfg-api-key'),
    'cfg-hotkey': createMockElem('cfg-hotkey'),
    'connection-test-result': createMockElem('connection-test-result'),
    'btn-refresh-history': createMockElem('btn-refresh-history'),
    'btn-add-dict': createMockElem('btn-add-dict'),
    'dict-input': createMockElem('dict-input'),
    'settings-form': createMockElem('settings-form'),
    'btn-test-connection': createMockElem('btn-test-connection')
  };

  global.document = {
    getElementById: (id) => domStore[id] || createMockElem(id),
    querySelectorAll: (sel) => []
  };

  const controller = new HubController(mockApi);
  await controller.loadHistory();

  // Verify History rendered both cards with action buttons
  assert.ok(domStore['history-list'].innerHTML.includes('uuid-1'), 'History should contain uuid-1');
  assert.ok(domStore['history-list'].innerHTML.includes('btn-play-audio'), 'Play Audio button must be present for recordings with audio');
  assert.ok(domStore['history-list'].innerHTML.includes('btn-retranscribe'), 'Re-Transcribe button must be present for offline recovery');

  // Verify Re-transcribe call
  const fakeBtn = { innerText: '', disabled: false };
  await controller.retranscribe('uuid-2', fakeBtn);
  assert.strictEqual(retranscribeCalledWith, 'uuid-2', 'Retranscribe must be invoked with selected recording ID');

  console.log('✅ ALL Phase 5 Automated Tests Passed Successfully!');
}

runTests().catch(err => {
  console.error('❌ Phase 5 Test Failed:', err);
  process.exit(1);
});
