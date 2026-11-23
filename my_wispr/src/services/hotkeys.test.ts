import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HANDS_FREE_HOTKEY,
  DEFAULT_PTT_HOTKEY,
  bindingFromKeyEvent,
  formatHotkeyBinding,
  matchesHotkeyDown,
  matchesHotkeyRelease,
} from './hotkeys';

test('default hotkeys match fn for push-to-talk and Ctrl + Alt + Space for hands-free', () => {
  assert.equal(DEFAULT_PTT_HOTKEY.code, 'Fn');
  assert.equal(DEFAULT_PTT_HOTKEY.label, 'fn');

  assert.equal(DEFAULT_HANDS_FREE_HOTKEY.code, 'Space');
  assert.equal(DEFAULT_HANDS_FREE_HOTKEY.ctrl, true);
  assert.equal(DEFAULT_HANDS_FREE_HOTKEY.alt, true);
  assert.equal(DEFAULT_HANDS_FREE_HOTKEY.label, 'Ctrl + Alt + Space');
});

test('formats single keys and multi-modifier combos cleanly', () => {
  assert.equal(formatHotkeyBinding({ code: 'Fn' }), 'fn');
  assert.equal(formatHotkeyBinding({ code: 'Space', ctrl: true, alt: true }), 'Ctrl + Alt + Space');
  assert.equal(formatHotkeyBinding({ code: 'KeyD', ctrl: true, shift: true }), 'Ctrl + Shift + D');
  assert.equal(formatHotkeyBinding({ code: 'ControlRight' }), 'Right Ctrl');
});

test('matchesHotkeyDown requires exact modifier match for combos and single keys', () => {
  const comboEvent = { code: 'Space', key: ' ', ctrlKey: true, altKey: true, shiftKey: false, metaKey: false };
  const spaceOnlyEvent = { code: 'Space', key: ' ', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  const extraShiftEvent = { code: 'Space', key: ' ', ctrlKey: true, altKey: true, shiftKey: true, metaKey: false };

  assert.equal(matchesHotkeyDown(comboEvent, DEFAULT_HANDS_FREE_HOTKEY), true);
  assert.equal(matchesHotkeyDown(spaceOnlyEvent, DEFAULT_HANDS_FREE_HOTKEY), false);
  assert.equal(matchesHotkeyDown(extraShiftEvent, DEFAULT_HANDS_FREE_HOTKEY), false);

  const fnEvent = { code: 'Fn', key: 'Fn', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  assert.equal(matchesHotkeyDown(fnEvent, DEFAULT_PTT_HOTKEY), true);
});

test('matchesHotkeyRelease stops push-to-talk when main key or required modifier is released', () => {
  const customPtt = bindingFromKeyEvent({
    code: 'Space',
    key: ' ',
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  });
  assert.equal(customPtt.label, 'Ctrl + Space');
  assert.equal(
    matchesHotkeyRelease({ code: 'Space', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }, customPtt),
    true
  );
  assert.equal(
    matchesHotkeyRelease({ code: 'ControlLeft', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }, customPtt),
    true
  );
  assert.equal(
    matchesHotkeyRelease({ code: 'ShiftLeft', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }, customPtt),
    false
  );
});
