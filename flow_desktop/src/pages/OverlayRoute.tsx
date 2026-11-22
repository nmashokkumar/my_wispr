import { useEffect } from 'react';
import { OverlayPill } from '../components/OverlayPill';
import { useFlowStore } from '../store/useFlowStore';
import { hotkeyProvider } from '../services/hotkeys';

/**
 * Standalone transparent /overlay route loaded inside the always-on-top frameless
 * Electron overlay window on Ubuntu/Wayland.
 */
export function OverlayRoute() {
  const overlayState = useFlowStore((s) => s.overlayState);
  const settings = useFlowStore((s) => s.settings);
  const startDictation = useFlowStore((s) => s.startDictation);
  const stopDictation = useFlowStore((s) => s.stopDictation);
  const cancelDictation = useFlowStore((s) => s.cancelDictation);

  useEffect(() => {
    document.documentElement.classList.add('overlay-transparent');
    document.body.classList.add('overlay-transparent');
    return () => {
      document.documentElement.classList.remove('overlay-transparent');
      document.body.classList.remove('overlay-transparent');
    };
  }, []);

  // Sync window visibility with Electron main process
  // Keep overlay window hidden when idle, popping up only during dictation lifecycle
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    if (overlayState === 'listening' || overlayState === 'transcribing') {
      window.electronAPI.showOverlay();
    } else if (overlayState === 'done') {
      // Allow user to click through cleanly while the "Inserted" checkmark is shown
      window.electronAPI.setIgnoreMouseEvents?.(true, { forward: true });
      // When dictation finishes, hide the overlay cleanly after the checkmark
      const timer = setTimeout(() => {
        window.electronAPI?.hideOverlay();
        if (useFlowStore.getState().overlayState === 'done') {
          useFlowStore.setState({ overlayState: 'idle' });
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else if (overlayState === 'idle') {
      window.electronAPI.hideOverlay();
    } else if (overlayState === 'error') {
      window.electronAPI.showOverlay();
    }
  }, [overlayState]);

  // Wire Electron IPC trigger
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.onDictationTrigger) return;

    return window.electronAPI.onDictationTrigger(({ mode }) => {
      const current = useFlowStore.getState().overlayState;
      if (current === 'listening') {
        void stopDictation();
      } else {
        void startDictation(mode);
      }
    });
  }, [startDictation, stopDictation]);

  // Fallback in-window hotkeys for testing in browser tabs
  useEffect(() => {
    return hotkeyProvider.subscribe({
      pushToTalkHotkey: settings.pushToTalkHotkey,
      handsFreeHotkey: settings.handsFreeHotkey,
      onStart: (mode) => void startDictation(mode),
      onStop: () => void stopDictation(),
      onCancel: () => {
        cancelDictation();
        window.electronAPI?.hideOverlay();
      },
      isListening: () => useFlowStore.getState().overlayState === 'listening',
      getActiveMode: () => useFlowStore.getState().settings.dictationMode,
    });
  }, [
    settings.pushToTalkHotkey,
    settings.handsFreeHotkey,
    startDictation,
    stopDictation,
    cancelDictation,
  ]);

  return (
    <main className="min-h-screen h-screen w-full bg-transparent flex items-center justify-center overflow-hidden">
      <OverlayPill standalone />
    </main>
  );
}
