import { useEffect } from 'react';
import { OverlayPill } from '../components/OverlayPill';
import { useFlowStore } from '../store/useFlowStore';
import { hotkeyProvider } from '../services/hotkeys';

/**
 * Standalone transparent /overlay route designed to load inside an
 * always-on-top frameless Electron or Tauri overlay window on Ubuntu/Wayland.
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
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    if (overlayState === 'listening' || overlayState === 'transcribing') {
      window.electronAPI.showOverlay();
      window.electronAPI.setIgnoreMouseEvents?.(true, { forward: true });
    } else if (overlayState === 'done') {
      window.electronAPI.setIgnoreMouseEvents?.(true, { forward: true });
      const timer = setTimeout(() => {
        window.electronAPI?.hideOverlay();
        if (useFlowStore.getState().overlayState === 'done') {
          useFlowStore.setState({ overlayState: 'idle' });
        }
      }, 1200);
      return () => clearTimeout(timer);
    } else if (overlayState === 'idle') {
      window.electronAPI.hideOverlay();
    } else if (overlayState === 'error') {
      window.electronAPI.showOverlay();
    }
  }, [overlayState]);

  // Wire Electron IPC triggers
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    const unsubs: Array<() => void> = [];

    if (window.electronAPI.onDictationStart) {
      unsubs.push(
        window.electronAPI.onDictationStart(({ mode }) => {
          const current = useFlowStore.getState().overlayState;
          if (current !== 'listening') {
            void startDictation(mode);
          }
        })
      );
    }

    if (window.electronAPI.onDictationStop) {
      unsubs.push(
        window.electronAPI.onDictationStop(() => {
          const current = useFlowStore.getState().overlayState;
          if (current === 'listening') {
            void stopDictation();
          }
        })
      );
    }

    if (window.electronAPI.onDictationToggle) {
      unsubs.push(
        window.electronAPI.onDictationToggle(({ mode }) => {
          const current = useFlowStore.getState().overlayState;
          if (current === 'listening') {
            void stopDictation();
          } else {
            void startDictation(mode);
          }
        })
      );
    }

    if (window.electronAPI.onDictationTrigger) {
      unsubs.push(
        window.electronAPI.onDictationTrigger(({ mode }) => {
          const current = useFlowStore.getState().overlayState;
          if (current === 'listening') {
            void stopDictation();
          } else {
            void startDictation(mode);
          }
        })
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
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
      getActiveMode: () =>
        useFlowStore.getState().activeRecordingMode ?? useFlowStore.getState().settings.dictationMode,
    });
  }, [
    settings.pushToTalkHotkey,
    settings.handsFreeHotkey,
    startDictation,
    stopDictation,
    cancelDictation,
  ]);

  return (
    <main className="min-h-screen w-full bg-transparent">
      <OverlayPill standalone />
    </main>
  );
}
