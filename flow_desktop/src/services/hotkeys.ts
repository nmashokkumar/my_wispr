import type { DictationMode, HotkeyBinding } from '../types';

export const DEFAULT_PTT_HOTKEY: HotkeyBinding = {
  code: 'Fn',
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  label: 'fn',
};

export const DEFAULT_HANDS_FREE_HOTKEY: HotkeyBinding = {
  code: 'Space',
  ctrl: true,
  alt: true,
  shift: false,
  meta: false,
  label: 'Ctrl + Alt + Space',
};

export interface HotkeySubscriptionConfig {
  pushToTalkHotkey: HotkeyBinding;
  handsFreeHotkey: HotkeyBinding;
  onStart: (triggeredMode: DictationMode) => void;
  onStop: () => void;
  onCancel: () => void;
  isListening: () => boolean;
  getActiveMode: () => DictationMode;
  isSuspended?: () => boolean;
}

/**
 * Abstraction for hotkey listeners.
 * Swap BrowserHotkeyProvider for an Electron globalShortcut / uiohook-napi or
 * Tauri global-shortcut implementation when wrapping this app for Ubuntu/Wayland desktop.
 */
export interface HotkeyProvider {
  subscribe(config: HotkeySubscriptionConfig): () => void;
}

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
]);

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

export function formatKeyCodeLabel(code: string): string {
  const map: Record<string, string> = {
    Fn: 'fn',
    WakeUp: 'fn',
    ControlRight: 'Right Ctrl',
    ControlLeft: 'Left Ctrl',
    AltRight: 'Right Alt',
    AltLeft: 'Left Alt',
    MetaRight: 'Right Super',
    MetaLeft: 'Left Super',
    ShiftRight: 'Right Shift',
    ShiftLeft: 'Left Shift',
    Space: 'Space',
    Backquote: '`',
    CapsLock: 'Caps Lock',
    Tab: 'Tab',
    Enter: 'Enter',
    Backspace: 'Backspace',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function formatHotkeyBinding(binding: Omit<HotkeyBinding, 'label'>): string {
  const parts: string[] = [];
  const isSoloModifier = isModifierCode(binding.code);

  if (!isSoloModifier) {
    if (binding.ctrl) parts.push('Ctrl');
    if (binding.alt) parts.push('Alt');
    if (binding.shift) parts.push('Shift');
    if (binding.meta) parts.push('Super');
  }
  parts.push(formatKeyCodeLabel(binding.code));
  return parts.join(' + ');
}

export interface KeyEventLike {
  code: string;
  key?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function bindingFromKeyEvent(e: KeyEventLike): HotkeyBinding {
  const code = e.key === 'Fn' || e.code === 'WakeUp' ? 'Fn' : e.code;
  const soloModifier = isModifierCode(code);
  const raw: Omit<HotkeyBinding, 'label'> = {
    code,
    ctrl: soloModifier ? false : Boolean(e.ctrlKey),
    alt: soloModifier ? false : Boolean(e.altKey),
    shift: soloModifier ? false : Boolean(e.shiftKey),
    meta: soloModifier ? false : Boolean(e.metaKey),
  };
  return {
    ...raw,
    label: formatHotkeyBinding(raw),
  };
}

export function matchesHotkeyDown(e: KeyEventLike, binding: HotkeyBinding): boolean {
  const eventCode = e.key === 'Fn' || e.code === 'WakeUp' ? 'Fn' : e.code;
  if (eventCode !== binding.code) return false;

  if (isModifierCode(binding.code)) {
    // For solo modifier bindings (e.g. Right Ctrl), ensure no unrelated modifiers are held
    const expectCtrl = binding.code === 'ControlLeft' || binding.code === 'ControlRight';
    const expectAlt = binding.code === 'AltLeft' || binding.code === 'AltRight';
    const expectShift = binding.code === 'ShiftLeft' || binding.code === 'ShiftRight';
    const expectMeta = binding.code === 'MetaLeft' || binding.code === 'MetaRight';
    return (
      Boolean(e.ctrlKey) === expectCtrl &&
      Boolean(e.altKey) === expectAlt &&
      Boolean(e.shiftKey) === expectShift &&
      Boolean(e.metaKey) === expectMeta
    );
  }

  return (
    Boolean(e.ctrlKey) === Boolean(binding.ctrl) &&
    Boolean(e.altKey) === Boolean(binding.alt) &&
    Boolean(e.shiftKey) === Boolean(binding.shift) &&
    Boolean(e.metaKey) === Boolean(binding.meta)
  );
}

export function matchesHotkeyRelease(e: KeyEventLike, binding: HotkeyBinding): boolean {
  const eventCode = e.key === 'Fn' || e.code === 'WakeUp' ? 'Fn' : e.code;
  if (eventCode === binding.code) return true;
  if (binding.ctrl && (e.code === 'ControlLeft' || e.code === 'ControlRight')) return true;
  if (binding.alt && (e.code === 'AltLeft' || e.code === 'AltRight')) return true;
  if (binding.shift && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) return true;
  if (binding.meta && (e.code === 'MetaLeft' || e.code === 'MetaRight')) return true;
  return false;
}

export class BrowserHotkeyProvider implements HotkeyProvider {
  subscribe(config: HotkeySubscriptionConfig): () => void {
    let pttHeld = false;
    let lastHandsFreeTapAt = 0;

    const shouldIgnoreForTyping = (target: EventTarget | null, binding: HotkeyBinding): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
      if (!isEditable) return false;
      // Allow combos with Ctrl/Alt/Meta, solo modifiers, Fn, and Function keys inside inputs
      const hasAccelerator = Boolean(binding.ctrl || binding.alt || binding.meta);
      const isSpecialKey =
        isModifierCode(binding.code) || binding.code === 'Fn' || /^F\d+$/.test(binding.code);
      return !(hasAccelerator || isSpecialKey);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (config.isSuspended?.()) return;

      // Escape stops hands-free or cancels push-to-talk
      if (e.code === 'Escape' && config.isListening()) {
        e.preventDefault();
        if (config.getActiveMode() === 'hands_free') {
          config.onStop();
        } else {
          pttHeld = false;
          config.onCancel();
        }
        return;
      }

      if (e.repeat) return;

      // 1. Check Hands-free hotkey first (often a more specific combo like Ctrl+Alt+Space)
      if (matchesHotkeyDown(e, config.handsFreeHotkey)) {
        if (shouldIgnoreForTyping(e.target, config.handsFreeHotkey)) return;
        e.preventDefault();
        const now = performance.now();
        if (config.isListening()) {
          if (now - lastHandsFreeTapAt < 320) return;
          pttHeld = false;
          config.onStop();
        } else {
          lastHandsFreeTapAt = now;
          config.onStart('hands_free');
        }
        return;
      }

      // 2. Check Push-to-talk hotkey (hold to record, release to stop)
      if (matchesHotkeyDown(e, config.pushToTalkHotkey)) {
        if (shouldIgnoreForTyping(e.target, config.pushToTalkHotkey)) return;
        e.preventDefault();
        if (!pttHeld && !config.isListening()) {
          pttHeld = true;
          config.onStart('push_to_talk');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (config.isSuspended?.()) return;
      if (pttHeld && matchesHotkeyRelease(e, config.pushToTalkHotkey)) {
        pttHeld = false;
        if (config.isListening()) {
          config.onStop();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }
}

export const hotkeyProvider: HotkeyProvider = new BrowserHotkeyProvider();
