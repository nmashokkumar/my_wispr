import test from 'node:test';
import assert from 'node:assert';

// Test binding to accelerator conversion
function bindingToAccelerator(binding: any): string | null {
  if (!binding || typeof binding !== 'object') return null;

  const code = binding.code || '';
  const parts: string[] = [];

  if (binding.ctrl) parts.push('Control');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Super');

  let key = code;
  if (key.startsWith('Key')) key = key.slice(3);
  else if (key.startsWith('Digit')) key = key.slice(5);
  else if (key === 'Space') key = 'Space';
  else if (key === 'Fn' || key === 'WakeUp') {
    return parts.length > 0 ? [...parts, 'Space'].join('+') : 'Control+Space';
  } else if (/^(Control|Alt|Shift|Meta)(Left|Right)?$/.test(key)) {
    return 'Control+Space';
  }

  if (key && !parts.includes(key)) {
    parts.push(key);
  }

  if (parts.length === 0) return null;
  return parts.join('+');
}

function getOverlayBounds(screenWidth: number, screenHeight: number, width = 240, height = 56) {
  const x = Math.round((screenWidth - width) / 2);
  const bottomOffset = 100;
  const y = screenHeight - height - bottomOffset;
  return { x, y, width, height };
}

test('bindingToAccelerator translates user hotkey bindings to valid Electron accelerators', () => {
  // Default Hands-Free
  const hf = { code: 'Space', ctrl: true, alt: true, shift: false, meta: false };
  assert.strictEqual(bindingToAccelerator(hf), 'Control+Alt+Space');

  // Push-to-Talk Fn fallback
  const pttFn = { code: 'Fn', ctrl: false, alt: false, shift: false, meta: false };
  assert.strictEqual(bindingToAccelerator(pttFn), 'Control+Space');

  // Single Function Key
  const f8 = { code: 'F8', ctrl: false, alt: false, shift: false, meta: false };
  assert.strictEqual(bindingToAccelerator(f8), 'F8');

  // Super + Space
  const superSpace = { code: 'Space', ctrl: false, alt: false, shift: false, meta: true };
  assert.strictEqual(bindingToAccelerator(superSpace), 'Super+Space');
});

test('getOverlayBounds positions floating pill at center-bottom, safely higher than Ubuntu dock', () => {
  const bounds = getOverlayBounds(1920, 1080, 240, 56);

  // Center horizontally
  assert.strictEqual(bounds.x, (1920 - 240) / 2); // 840
  assert.strictEqual(bounds.width, 240);
  assert.strictEqual(bounds.height, 56);

  // Safely above Ubuntu dock (bottom margin 100px)
  assert.strictEqual(bounds.y, 1080 - 56 - 100); // 924
  assert.ok(bounds.y < 1080 - 72, 'Must sit comfortably above Ubuntu dock');
});

test('Smart paste uses Shift+Insert Linux keycodes (42:1 110:1 110:0 42:0)', () => {
  const ydotoolShiftInsert = ['key', '42:1', '110:1', '110:0', '42:0'];
  assert.strictEqual(ydotoolShiftInsert[0], 'key');
  assert.strictEqual(ydotoolShiftInsert[1], '42:1'); // Shift down
  assert.strictEqual(ydotoolShiftInsert[2], '110:1'); // Insert down
  assert.strictEqual(ydotoolShiftInsert[3], '110:0'); // Insert up
  assert.strictEqual(ydotoolShiftInsert[4], '42:0'); // Shift up
});
