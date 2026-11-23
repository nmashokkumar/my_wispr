import test from 'node:test';
import assert from 'node:assert';
// @ts-ignore
import {
  GnomeShortcutManager,
  bindingToAccelerator,
  createHotkeyRepeatGate,
  VALID_SHORTCUT_PATTERN,
  SLOT_CONFIG,
} from '../electron/gnomeShortcut.cjs';

function getOverlayBounds(screenWidth: number, screenHeight: number, width = 240, height = 56) {
  const x = Math.round((screenWidth - width) / 2);
  const bottomOffset = 100;
  const y = screenHeight - height - bottomOffset;
  return { x, y, width, height };
}

// Overlay visibility rules
function getOverlayWindowVisibility(overlayState: string): 'show' | 'hide' {
  if (overlayState === 'listening' || overlayState === 'transcribing' || overlayState === 'done' || overlayState === 'error') {
    return 'show';
  }
  return 'hide'; // 'idle' stays hidden
}

// Overlay pill rendering rules
function shouldRenderOverlayPill(standalone: boolean, overlayState: string): boolean {
  if (!standalone) return false;
  if (overlayState === 'idle') return false;
  return true;
}

// Hands-free tick button and pipe separator rules
function shouldShowTickAndPipe(dictationMode: string, overlayState: string): boolean {
  return dictationMode === 'hands_free' && overlayState === 'listening';
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

test('GnomeShortcutManager converts accelerators to valid GNOME format', () => {
  assert.strictEqual(GnomeShortcutManager.convertToGnomeFormat('Control+Alt+Space'), '<Control><Alt>space');
  assert.strictEqual(GnomeShortcutManager.isValidShortcut('<Control><Alt>space'), true);

  assert.strictEqual(GnomeShortcutManager.convertToGnomeFormat('Control+Space'), '<Control>space');
  assert.strictEqual(GnomeShortcutManager.isValidShortcut('<Control>space'), true);

  assert.strictEqual(GnomeShortcutManager.convertToGnomeFormat('Super+Space'), '<Super>space');
  assert.strictEqual(GnomeShortcutManager.isValidShortcut('<Super>space'), true);

  assert.strictEqual(GnomeShortcutManager.convertToGnomeFormat('F8'), 'F8');
  assert.strictEqual(GnomeShortcutManager.isValidShortcut('F8'), true);

  assert.strictEqual(GnomeShortcutManager.convertToGnomeFormat('Control+Shift+D'), '<Control><Shift>d');
  assert.strictEqual(GnomeShortcutManager.isValidShortcut('<Control><Shift>d'), true);
});

test('GnomeShortcutManager detects invalid shortcuts correctly', () => {
  assert.strictEqual(GnomeShortcutManager.isValidShortcut('invalid+++key'), false);
  assert.strictEqual(GnomeShortcutManager.isValidShortcut(''), false);
  assert.strictEqual(GnomeShortcutManager.isValidShortcut(null as any), false);
});

test('createHotkeyRepeatGate suppresses rapid duplicate presses within window', () => {
  let currentTime = 1000;
  const gate = createHotkeyRepeatGate(400, () => currentTime);

  // First press passes
  assert.strictEqual(gate(), true);

  // Immediate repeat inside 400ms window is blocked
  currentTime = 1100;
  assert.strictEqual(gate(), false);
  currentTime = 1350;
  assert.strictEqual(gate(), false);

  // Press after window passes
  currentTime = 1500;
  assert.strictEqual(gate(), true);
});

test('GnomeShortcutManager HTTP trigger triggers dictation callback', async () => {
  let triggeredMode: string | null = null;
  const manager = new GnomeShortcutManager({
    httpPort: 51199,
    onDictationTrigger: (mode: string) => {
      triggeredMode = mode;
    },
  });

  const ok = manager.initHttpServer();
  assert.strictEqual(ok, true);

  try {
    const res = await fetch('http://127.0.0.1:51199/trigger?mode=hands_free');
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.mode, 'hands_free');
    assert.strictEqual(triggeredMode, 'hands_free');
  } finally {
    manager.close();
  }
});

test('Overlay window is hidden when idle and only shown when dictation is triggered', () => {
  // Idle state: must be hidden
  assert.strictEqual(getOverlayWindowVisibility('idle'), 'hide');

  // Active dictation states: must be shown
  assert.strictEqual(getOverlayWindowVisibility('listening'), 'show');
  assert.strictEqual(getOverlayWindowVisibility('transcribing'), 'show');
  assert.strictEqual(getOverlayWindowVisibility('done'), 'show');
  assert.strictEqual(getOverlayWindowVisibility('error'), 'show');
});

test('Static in-page rendering of OverlayPill is disabled (standalone requirement)', () => {
  // In-page (standalone = false): never render, avoiding dashboard clutter
  assert.strictEqual(shouldRenderOverlayPill(false, 'idle'), false);
  assert.strictEqual(shouldRenderOverlayPill(false, 'listening'), false);

  // Standalone: only render when not idle
  assert.strictEqual(shouldRenderOverlayPill(true, 'idle'), false);
  assert.strictEqual(shouldRenderOverlayPill(true, 'listening'), true);
  assert.strictEqual(shouldRenderOverlayPill(true, 'transcribing'), true);
  assert.strictEqual(shouldRenderOverlayPill(true, 'done'), true);
});

test('The pipe "|" and tick button "✓" appear ONLY in hands-free mode when actively dictating', () => {
  // Idle: never show tick or pipe
  assert.strictEqual(shouldShowTickAndPipe('hands_free', 'idle'), false);
  assert.strictEqual(shouldShowTickAndPipe('push_to_talk', 'idle'), false);

  // Push-to-talk listening: never show tick or pipe
  assert.strictEqual(shouldShowTickAndPipe('push_to_talk', 'listening'), false);

  // Hands-free listening (actively dictating): show tick and pipe
  assert.strictEqual(shouldShowTickAndPipe('hands_free', 'listening'), true);

  // Transcribing / Done: tick button is not shown
  assert.strictEqual(shouldShowTickAndPipe('hands_free', 'transcribing'), false);
  assert.strictEqual(shouldShowTickAndPipe('hands_free', 'done'), false);
});
