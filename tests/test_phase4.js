/**
 * Automated Verification Suite for Phase 4:
 * Tests the Floating Pill Overlay, DOM Structure, Glassmorphic Styling,
 * State Machine Transitions, Waveform Bar Scaling, and Sound Integration.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..', 'client');

function runTests() {
  console.log('--- Starting Phase 4 Floating Overlay & Word Counter Verification ---');

  // Test 1: File Existence
  const overlayHtml = path.join(CLIENT_DIR, 'src', 'renderer', 'overlay', 'index.html');
  const overlayCss = path.join(CLIENT_DIR, 'src', 'renderer', 'overlay', 'style.css');
  const overlayJs = path.join(CLIENT_DIR, 'src', 'renderer', 'overlay', 'overlay.js');
  const overlayWindowJs = path.join(CLIENT_DIR, 'src', 'main', 'overlayWindow.js');
  const preloadJs = path.join(CLIENT_DIR, 'src', 'main', 'preload.js');

  assert.ok(fs.existsSync(overlayHtml), 'index.html must exist');
  assert.ok(fs.existsSync(overlayCss), 'style.css must exist');
  assert.ok(fs.existsSync(overlayJs), 'overlay.js must exist');
  assert.ok(fs.existsSync(overlayWindowJs), 'overlayWindow.js must exist');
  assert.ok(fs.existsSync(preloadJs), 'preload.js must exist');

  // Test 2: HTML DOM Structure
  console.log('Validating HTML DOM structure...');
  const htmlContent = fs.readFileSync(overlayHtml, 'utf8');
  assert.ok(htmlContent.includes('id="pill-container"'), 'Pill container must exist');
  assert.ok(htmlContent.includes('id="icon-mic"'), 'Mic icon must exist');
  assert.ok(htmlContent.includes('id="icon-spinner"'), 'Spinner must exist');
  assert.ok(htmlContent.includes('id="icon-check"'), 'Checkmark icon must exist');
  assert.ok(htmlContent.includes('id="icon-error"'), 'Error icon must exist');
  assert.ok(htmlContent.includes('id="waveform-visualizer"'), 'Waveform visualizer must exist');
  assert.ok(htmlContent.includes('id="word-counter-number"'), 'Word counter number must exist');

  // Count wave bars
  const barMatches = htmlContent.match(/class="wave-bar bar-\d"/g) || [];
  assert.strictEqual(barMatches.length, 7, 'Must have exactly 7 animated waveform bars');

  // Test 3: CSS Styles & Glassmorphic Pill Aesthetics
  console.log('Validating CSS glassmorphic styles...');
  const cssContent = fs.readFileSync(overlayCss, 'utf8');
  assert.ok(cssContent.includes('backdrop-filter: blur'), 'Glassmorphism blur must be present');
  assert.ok(cssContent.includes('border-radius: 9999px'), 'Pill rounded geometry must be present');
  assert.ok(cssContent.includes('@keyframes spin'), 'Spinner keyframes must be present');
  assert.ok(cssContent.includes('@keyframes pulse-glow'), 'Pulse glow keyframes must be present');
  assert.ok(cssContent.includes('#38bdf8'), 'Wispr Flow cyan/blue brand color must be present');

  // Test 4: OverlayController State Machine Simulation
  console.log('Validating OverlayController state machine...');
  const { OverlayController } = require(overlayJs);

  // Mock DOM environment for headless testing
  const createMockElement = (id) => ({
    id,
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      contains(c) { return this.classes.has(c); }
    },
    style: {},
    innerText: ''
  });

  const mockDom = {
    'pill-container': createMockElement('pill-container'),
    'icon-mic': createMockElement('icon-mic'),
    'icon-spinner': createMockElement('icon-spinner'),
    'icon-check': createMockElement('icon-check'),
    'icon-error': createMockElement('icon-error'),
    'waveform-visualizer': createMockElement('waveform-visualizer'),
    'status-label': createMockElement('status-label'),
    'word-counter-container': createMockElement('word-counter-container'),
    'word-counter-number': createMockElement('word-counter-number')
  };

  global.document = {
    getElementById: (id) => mockDom[id],
    querySelectorAll: () => Array.from({ length: 7 }, () => ({ style: {} }))
  };
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = (cb) => setTimeout(cb, 10);

  const controller = new OverlayController();
  assert.strictEqual(controller.state, 'idle');

  // Transition to listening
  controller.setState('listening', { rms: 0.8 });
  assert.strictEqual(controller.state, 'listening');
  assert.ok(mockDom['icon-mic'].classList.contains('hidden') === false);
  assert.ok(mockDom['waveform-visualizer'].classList.contains('hidden') === false);
  assert.ok(mockDom['icon-check'].classList.contains('hidden') === true);

  // Test waveform bar scaling
  controller.updateWaveform(0.9);
  controller.bars.forEach((bar) => {
    assert.ok(bar.style.height, 'Waveform bar height must be set');
    const heightNum = parseInt(bar.style.height, 10);
    assert.ok(heightNum >= 4 && heightNum <= 26, `Height should be in scale range (got ${heightNum})`);
  });

  // Transition to processing
  controller.setState('processing', { label: 'Transcribing speech...' });
  assert.strictEqual(controller.state, 'processing');
  assert.ok(mockDom['icon-spinner'].classList.contains('hidden') === false);
  assert.strictEqual(mockDom['status-label'].innerText, 'Transcribing speech...');

  // Transition to success
  controller.setState('success', { numWords: 35 });
  assert.strictEqual(controller.state, 'success');
  assert.ok(mockDom['icon-check'].classList.contains('hidden') === false);
  assert.ok(mockDom['word-counter-container'].classList.contains('hidden') === false);

  // Transition to error
  controller.setState('error', { label: 'Network down - Audio Saved' });
  assert.strictEqual(controller.state, 'error');
  assert.ok(mockDom['icon-error'].classList.contains('hidden') === false);
  assert.strictEqual(mockDom['status-label'].innerText, 'Network down - Audio Saved');

  // Test 5: Sound Assets Verification
  console.log('Verifying UI sound effects...');
  const soundsDir = path.join(CLIENT_DIR, 'assets', 'sounds');
  ['dictation-start.wav', 'dictation-stop.wav', 'paste.wav'].forEach((sound) => {
    const soundPath = path.join(soundsDir, sound);
    assert.ok(fs.existsSync(soundPath), `Sound ${sound} must exist`);
    assert.ok(fs.statSync(soundPath).size > 1000, `Sound ${sound} must have audio content`);
  });

  console.log('✅ ALL Phase 4 Automated Tests Passed Successfully!');
}

runTests();
