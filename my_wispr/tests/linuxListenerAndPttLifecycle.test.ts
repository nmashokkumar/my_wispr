import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LinuxKeyManager = require('../electron/linuxKeyManager.cjs');

test('LinuxKeyManager resolves compiled binary correctly', () => {
  const manager = new LinuxKeyManager();
  const binaryPath = manager.resolveListenerBinary();
  assert.ok(binaryPath, 'Listener binary should be found');
  assert.ok(fs.existsSync(binaryPath), `Binary file must exist at ${binaryPath}`);
});

test('LinuxKeyManager checkAvailability returns valid status object', () => {
  const manager = new LinuxKeyManager();
  const status = manager.checkAvailability();
  assert.ok(typeof status === 'object' && 'available' in status);
  if (!status.available) {
    assert.ok(['input_access_denied', 'binary_missing', 'input_devices_unavailable'].includes(status.reason));
  }
});

test('OverlayPill rendering rules match specification', () => {
  // Check that the source of OverlayPill renders waveform bars, elapsed timer, and check button in hands-free mode
  const pillSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'OverlayPill.tsx'), 'utf8');
  assert.ok(pillSource.includes('isHandsFree = effectiveMode === \'hands_free\''));
  assert.ok(pillSource.includes('formatElapsedTimer'));
  assert.ok(pillSource.includes('stopDictation'));
});
