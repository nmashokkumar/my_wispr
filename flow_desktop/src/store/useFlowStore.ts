import { create } from 'zustand';
import type {
  AppSettings,
  AutoCleanupConfig,
  DictionaryEntry,
  DictationMode,
  DictationOverlayState,
  DictationStage,
  HistoryEntry,
  NavPage,
  StyleContext,
  StylePreset,
  ToastMessage,
} from '../types';
import {
  clearAllHistory,
  deleteHistoryEntry,
  loadAllHistory,
  saveHistoryEntry,
} from '../services/db';
import { getDefaultServerUrl, transcribeAudio } from '../services/api';
import { AudioCaptureController } from '../services/audio';
import { DEFAULT_HANDS_FREE_HOTKEY, DEFAULT_PTT_HOTKEY } from '../services/hotkeys';
import { platform } from '../services/platform';
import { applyLocalCleanupPipeline } from '../utils/textPipeline';

const SETTINGS_KEY = 'flow_settings_v1';
const STYLES_KEY = 'flow_styles_v1';
const CLEANUP_KEY = 'flow_cleanup_v1';
const DICT_KEY = 'flow_dictionary_v1';
const DISMISSED_KEY = 'flow_dismissed_v1';

const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: getDefaultServerUrl(),
  apiKey: '',
  pushToTalkHotkey: DEFAULT_PTT_HOTKEY,
  handsFreeHotkey: DEFAULT_HANDS_FREE_HOTKEY,
  dictationMode: 'push_to_talk',
  micDeviceId: 'default',
  silenceTimeoutSec: 3,
  mockMode: false,
  theme: 'dark',
  activeContext: 'work',
  activeAppTag: 'Terminal',

  // Speech to Text configuration
  sttProvider: 'flow_server',
  sttEndpointUrl: 'http://localhost:8000',
  sttApiKey: '',

  // Language Model (AI text cleanup & polish)
  enableAiCleanup: true,
  llmProvider: 'self_hosted',
  llmEndpointUrl: 'http://192.168.1.126:11434/v1',
  llmApiKey: '',
  llmModel: 'llama3',
};

const DEFAULT_STYLES: Record<StyleContext, StylePreset> = {
  personal: 'casual',
  work: 'formal',
  email: 'formal',
  other: 'formal',
};

const DEFAULT_CLEANUP: AutoCleanupConfig = {
  removeFillerWords: true,
  applySelfCorrections: true,
  autoPunctuation: true,
  autoCapitalization: true,
};

const DEFAULT_DICTIONARY: DictionaryEntry[] = [];

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

const audioController = new AudioCaptureController();
let doneResetTimer: ReturnType<typeof setTimeout> | null = null;
let errorResetTimer: ReturnType<typeof setTimeout> | null = null;

// Optional BroadcastChannel so /overlay route stays synced if opened in a separate Electron/Tauri window
const overlayChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('flow-overlay-sync')
    : null;

interface DismissedBanners {
  dictationTips: boolean;
  dictionaryBanner: boolean;
}

export interface LastDictationPreview {
  text: string;
  rawText: string;
  fillerRemovedCount: number;
  correctionsAppliedCount: number;
  timestamp: number;
}

interface FlowState {
  activePage: NavPage;
  sidebarCollapsed: boolean;
  settingsOpen: boolean;
  isCapturingHotkey: boolean;

  settings: AppSettings;
  stylesByContext: Record<StyleContext, StylePreset>;
  cleanupConfig: AutoCleanupConfig;
  dictionary: DictionaryEntry[];
  dismissed: DismissedBanners;

  history: HistoryEntry[];
  historyLoaded: boolean;

  // Live dictation engine state
  overlayState: DictationOverlayState;
  activeStage: DictationStage;
  audioLevels: number[];
  overlayError: string | null;
  lastResult: LastDictationPreview | null;
  testInputText: string;

  toasts: ToastMessage[];

  // Actions
  setActivePage: (page: NavPage) => void;
  toggleSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setIsCapturingHotkey: (capturing: boolean) => void;

  updateSettings: (partial: Partial<AppSettings>) => void;
  toggleTheme: () => void;
  setDictationMode: (mode: DictationMode) => void;
  setStylePreset: (context: StyleContext, preset: StylePreset) => void;
  updateCleanupConfig: (partial: Partial<AutoCleanupConfig>) => void;
  dismissBanner: (key: keyof DismissedBanners) => void;

  // Dictionary CRUD
  addDictionaryEntry: (entry: Omit<DictionaryEntry, 'id' | 'createdAt' | 'scope'>) => void;
  updateDictionaryEntry: (id: string, updates: Partial<Omit<DictionaryEntry, 'id'>>) => void;
  deleteDictionaryEntry: (id: string) => void;
  toggleStarDictionaryEntry: (id: string) => void;
  importDictionaryEntries: (entries: Array<Omit<DictionaryEntry, 'id' | 'createdAt' | 'scope'>>) => number;

  // History CRUD
  initHistory: () => Promise<void>;
  toggleFlagHistory: (id: string) => Promise<void>;
  updateHistoryAppTag: (id: string, appTag: string) => Promise<void>;
  deleteHistory: (id: string) => Promise<void>;
  retranscribeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  resetAllState: () => Promise<void>;

  // Dictation engine
  startDictation: (overrideMode?: DictationMode) => Promise<void>;
  stopDictation: () => Promise<void>;
  cancelDictation: () => void;
  clearOverlayError: () => void;
  setTestInputText: (value: string) => void;
  appendTestInputText: (value: string) => void;

  // Toasts
  pushToast: (message: string, tone?: ToastMessage['tone']) => void;
  dismissToast: (id: string) => void;
}

const rawLoadedSettings = readJson<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
const initialSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  ...rawLoadedSettings,
  pushToTalkHotkey: rawLoadedSettings.pushToTalkHotkey?.code
    ? rawLoadedSettings.pushToTalkHotkey
    : DEFAULT_PTT_HOTKEY,
  handsFreeHotkey: rawLoadedSettings.handsFreeHotkey?.code
    ? rawLoadedSettings.handsFreeHotkey
    : DEFAULT_HANDS_FREE_HOTKEY,
};

export const useFlowStore = create<FlowState>((set, get) => {
  const broadcastOverlay = () => {
    if (!overlayChannel) return;
    const s = get();
    overlayChannel.postMessage({
      type: 'state',
      overlayState: s.overlayState,
      activeStage: s.activeStage,
      audioLevels: s.audioLevels,
      overlayError: s.overlayError,
      dictationMode: s.settings.dictationMode,
      pushToTalkHotkey: s.settings.pushToTalkHotkey,
      handsFreeHotkey: s.settings.handsFreeHotkey,
    });
  };

  if (overlayChannel) {
    overlayChannel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'state') {
        set({
          overlayState: msg.overlayState,
          activeStage: msg.activeStage,
          audioLevels: msg.audioLevels,
          overlayError: msg.overlayError,
        });
      }
    };
  }

  return {
    activePage: 'dictation',
    sidebarCollapsed: false,
    settingsOpen: false,
    isCapturingHotkey: false,

    settings: initialSettings,
    stylesByContext: readJson<Record<StyleContext, StylePreset>>(STYLES_KEY, DEFAULT_STYLES),
    cleanupConfig: readJson<AutoCleanupConfig>(CLEANUP_KEY, DEFAULT_CLEANUP),
    dictionary: readArray<DictionaryEntry>(DICT_KEY, DEFAULT_DICTIONARY),
    dismissed: readJson<DismissedBanners>(DISMISSED_KEY, {
      dictationTips: false,
      dictionaryBanner: false,
    }),

    history: [],
    historyLoaded: false,

    overlayState: 'idle',
    activeStage: 'record',
    audioLevels: Array(10).fill(0.18),
    overlayError: null,
    lastResult: null,
    testInputText: '',

    toasts: [],

    setActivePage: (activePage) => set({ activePage }),
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen, isCapturingHotkey: false }),
    setIsCapturingHotkey: (isCapturingHotkey) => set({ isCapturingHotkey }),

    updateSettings: (partial) =>
      set((state) => {
        const next = { ...state.settings, ...partial };
        writeJson(SETTINGS_KEY, next);
        if (
          (partial.pushToTalkHotkey || partial.handsFreeHotkey) &&
          typeof window !== 'undefined' &&
          window.electronAPI?.updateHotkeys
        ) {
          window.electronAPI.updateHotkeys({
            pushToTalk: next.pushToTalkHotkey,
            handsFree: next.handsFreeHotkey,
          }).catch(console.error);
        }
        return { settings: next };
      }),

    toggleTheme: () => {
      const current = get().settings.theme;
      get().updateSettings({ theme: current === 'light' ? 'dark' : 'light' });
    },

    setDictationMode: (dictationMode) => {
      get().updateSettings({ dictationMode });
      get().pushToast(
        dictationMode === 'push_to_talk' ? 'Switched to Push-to-talk mode' : 'Switched to Hands-free mode'
      );
      broadcastOverlay();
    },

    setStylePreset: (context, preset) =>
      set((state) => {
        const next = { ...state.stylesByContext, [context]: preset };
        writeJson(STYLES_KEY, next);
        return { stylesByContext: next };
      }),

    updateCleanupConfig: (partial) =>
      set((state) => {
        const next = { ...state.cleanupConfig, ...partial };
        writeJson(CLEANUP_KEY, next);
        return { cleanupConfig: next };
      }),

    dismissBanner: (key) =>
      set((state) => {
        const next = { ...state.dismissed, [key]: true };
        writeJson(DISMISSED_KEY, next);
        return { dismissed: next };
      }),

    addDictionaryEntry: (entry) =>
      set((state) => {
        const cleanTrigger = entry.trigger.trim();
        if (!cleanTrigger) return state;
        const exists = state.dictionary.some(
          (d) => d.trigger.toLowerCase() === cleanTrigger.toLowerCase()
        );
        if (exists) {
          get().pushToast(`"${cleanTrigger}" is already in your dictionary`, 'error');
          return state;
        }
        const nextEntry: DictionaryEntry = {
          id: `dict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: entry.type,
          trigger: cleanTrigger,
          replacement: entry.type === 'replacement' ? entry.replacement?.trim() : undefined,
          starred: entry.starred,
          scope: 'personal',
          createdAt: Date.now(),
        };
        const next = [nextEntry, ...state.dictionary];
        writeJson(DICT_KEY, next);
        return { dictionary: next };
      }),

    updateDictionaryEntry: (id, updates) =>
      set((state) => {
        const next = state.dictionary.map((item) =>
          item.id === id
            ? {
                ...item,
                ...updates,
                trigger: updates.trigger !== undefined ? updates.trigger.trim() : item.trigger,
                replacement:
                  updates.type === 'word'
                    ? undefined
                    : updates.replacement !== undefined
                      ? updates.replacement.trim()
                      : item.replacement,
              }
            : item
        );
        writeJson(DICT_KEY, next);
        return { dictionary: next };
      }),

    deleteDictionaryEntry: (id) =>
      set((state) => {
        const next = state.dictionary.filter((item) => item.id !== id);
        writeJson(DICT_KEY, next);
        return { dictionary: next };
      }),

    toggleStarDictionaryEntry: (id) =>
      set((state) => {
        const next = state.dictionary.map((item) =>
          item.id === id ? { ...item, starred: !item.starred } : item
        );
        writeJson(DICT_KEY, next);
        return { dictionary: next };
      }),

    importDictionaryEntries: (entries) => {
      let addedCount = 0;
      set((state) => {
        const existingTriggers = new Set(state.dictionary.map((d) => d.trigger.toLowerCase()));
        const additions: DictionaryEntry[] = [];
        for (const item of entries) {
          const trig = item.trigger.trim();
          if (!trig || existingTriggers.has(trig.toLowerCase())) continue;
          existingTriggers.add(trig.toLowerCase());
          additions.push({
            id: `dict-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: item.type,
            trigger: trig,
            replacement: item.type === 'replacement' ? item.replacement?.trim() : undefined,
            starred: item.starred,
            scope: 'personal',
            createdAt: Date.now() + addedCount,
          });
          addedCount += 1;
        }
        const next = [...additions, ...state.dictionary];
        writeJson(DICT_KEY, next);
        return { dictionary: next };
      });
      return addedCount;
    },

    initHistory: async () => {
      try {
        const items = await loadAllHistory();
        set({ history: items, historyLoaded: true });
      } catch {
        set({ historyLoaded: true });
      }
    },

    toggleFlagHistory: async (id) => {
      const target = get().history.find((h) => h.id === id);
      if (!target) return;
      const updated: HistoryEntry = { ...target, flagged: !target.flagged };
      await saveHistoryEntry(updated);
      set((s) => ({
        history: s.history.map((h) => (h.id === id ? updated : h)),
      }));
    },

    updateHistoryAppTag: async (id, appTag) => {
      const target = get().history.find((h) => h.id === id);
      if (!target) return;
      const updated: HistoryEntry = { ...target, appTag };
      await saveHistoryEntry(updated);
      set((s) => ({
        history: s.history.map((h) => (h.id === id ? updated : h)),
      }));
      get().pushToast(`Tagged entry as ${appTag}`);
    },

    deleteHistory: async (id) => {
      await deleteHistoryEntry(id);
      set((s) => ({
        history: s.history.filter((h) => h.id !== id),
      }));
      get().pushToast('Dictation deleted');
    },

    retranscribeHistory: async (id) => {
      const state = get();
      const target = state.history.find((h) => h.id === id);
      if (!target) return;

      const style = state.stylesByContext[target.contextUsed] ?? 'formal';
      try {
        let updated: HistoryEntry;

        if (target.audioBlob && !state.settings.mockMode) {
          set({ overlayState: 'transcribing', activeStage: 'transcribe', overlayError: null });
          broadcastOverlay();
          const result = await transcribeAudio(
            {
              audio: target.audioBlob,
              style,
              context: target.contextUsed,
              cleanup: state.cleanupConfig,
              dictionary: state.dictionary,
              language: target.language || 'en',
            },
            {
              baseUrl: state.settings.serverUrl,
              apiKey: state.settings.apiKey,
              mockMode: false,
            },
            (stage) => {
              set({ activeStage: stage });
              broadcastOverlay();
            }
          );
          updated = {
            ...target,
            text: result.text,
            rawText: result.raw_text,
            styleUsed: style,
            fillerRemovedCount: result.fillerRemovedCount,
            correctionsAppliedCount: result.correctionsAppliedCount,
          };
          set({ overlayState: 'idle' });
          broadcastOverlay();
        } else {
          // Re-run local cleanup, dictionary & current style rules on the stored raw transcript
          const reprocessed = applyLocalCleanupPipeline(target.rawText || target.text, {
            style,
            context: target.contextUsed,
            cleanup: state.cleanupConfig,
            dictionary: state.dictionary,
          });
          updated = {
            ...target,
            text: reprocessed.text,
            styleUsed: style,
            fillerRemovedCount: reprocessed.fillerRemovedCount,
            correctionsAppliedCount: reprocessed.correctionsAppliedCount,
          };
        }

        await saveHistoryEntry(updated);
        set((s) => ({
          history: s.history.map((h) => (h.id === id ? updated : h)),
        }));
        get().pushToast('Re-transcribed with current Style & Dictionary', 'success');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Re-transcription failed';
        set({ overlayState: 'error', overlayError: message });
        broadcastOverlay();
        get().pushToast(message, 'error');
      }
    },

    clearHistory: async () => {
      await clearAllHistory();
      set({ history: [] });
      get().pushToast('History cleared');
    },

    resetAllState: async () => {
      await clearAllHistory();
      if (typeof window !== 'undefined') {
        window.localStorage.clear();
      }
      set({
        settings: DEFAULT_SETTINGS,
        stylesByContext: DEFAULT_STYLES,
        cleanupConfig: DEFAULT_CLEANUP,
        dictionary: [],
        history: [],
        overlayState: 'idle',
        overlayError: null,
        testInputText: '',
      });
      get().pushToast('Reset to fresh state: history, presets & dictionary clean', 'success');
    },

    startDictation: async (overrideMode) => {
      const state = get();
      if (state.overlayState === 'listening' || state.overlayState === 'transcribing') return;

      if (doneResetTimer) clearTimeout(doneResetTimer);
      if (errorResetTimer) clearTimeout(errorResetTimer);

      const effectiveMode = overrideMode ?? state.settings.dictationMode;
      if (overrideMode && overrideMode !== state.settings.dictationMode) {
        get().updateSettings({ dictationMode: overrideMode });
      }

      set({
        overlayState: 'listening',
        activeStage: 'record',
        overlayError: null,
        audioLevels: Array(10).fill(0.22),
      });
      broadcastOverlay();

      // In push-to-talk, never auto-stop on silence: keep recording as long as the user holds the key!
      // In hands-free, only auto-stop if explicitly configured to a high threshold (>=15s)
      const silenceTimeoutMs =
        effectiveMode === 'hands_free' && state.settings.silenceTimeoutSec >= 15
          ? state.settings.silenceTimeoutSec * 1000
          : undefined;

      console.log(`[Flow Store] Starting dictation: mode=${effectiveMode}, micDeviceId=${state.settings.micDeviceId}`);

      try {
        await audioController.start({
          deviceId: state.settings.micDeviceId,
          silenceTimeoutMs,
          allowSimulatedFallback: state.settings.mockMode,
          callbacks: {
            onLevels: (bars) => {
              set({ audioLevels: bars });
              broadcastOverlay();
            },
            onSilenceTimeout: () => {
              if (get().overlayState === 'listening') {
                console.log('[Flow Store] Silence timeout auto-stopping dictation');
                void get().stopDictation();
              }
            },
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Microphone unavailable';
        console.error('[Flow Store] Failed to start microphone:', message);
        set({ overlayState: 'error', overlayError: message });
        broadcastOverlay();
        get().pushToast(message, 'error');
        errorResetTimer = setTimeout(() => {
          if (get().overlayState === 'error') {
            set({ overlayState: 'idle', overlayError: null });
            broadcastOverlay();
          }
        }, 5500);
      }
    },

    stopDictation: async () => {
      const state = get();
      if (state.overlayState !== 'listening') return;

      set({ overlayState: 'transcribing', activeStage: 'transcribe' });
      broadcastOverlay();

      try {
        const recording = await audioController.stop();
        console.log(`[Flow Store] Recording stopped: ${recording.blob.size} bytes, ${recording.durationMs}ms duration, simulated=${recording.simulated}`);

        // If recording was less than 120ms or completely empty, reset overlay cleanly
        if (recording.durationMs < 120 || recording.blob.size < 50) {
          console.warn('[Flow Store] Dictation was too short (<120ms), resetting overlay to idle');
          set({ overlayState: 'idle', activeStage: 'record', overlayError: null });
          broadcastOverlay();
          return;
        }

        const fresh = get();
        const context = fresh.settings.activeContext;
        const style = fresh.stylesByContext[context] ?? 'formal';

        let transcribedText = '';
        let rawText = '';
        let isServerTranscribed = false;

        try {
          const sttBaseUrl =
            fresh.settings.sttProvider === 'self_hosted'
              ? fresh.settings.sttEndpointUrl
              : fresh.settings.serverUrl || 'http://localhost:8000';
          const sttApiKey =
            fresh.settings.sttProvider === 'self_hosted'
              ? fresh.settings.sttApiKey
              : fresh.settings.apiKey;

          const result = await transcribeAudio(
            {
              audio: recording.blob,
              style,
              context,
              cleanup: fresh.cleanupConfig,
              dictionary: fresh.dictionary,
              language: 'en',
            },
            {
              baseUrl: sttBaseUrl,
              apiKey: sttApiKey,
              mockMode: fresh.settings.mockMode || fresh.settings.sttProvider === 'mock',
              timeoutMs: 6000,
              enableAiCleanup: fresh.settings.enableAiCleanup,
              llmEndpointUrl: fresh.settings.llmEndpointUrl,
              llmApiKey: fresh.settings.llmApiKey,
              llmModel: fresh.settings.llmModel,
            },
            (stage) => {
              set({ activeStage: stage });
              broadcastOverlay();
            }
          );
          transcribedText = result.text;
          rawText = result.raw_text;
          isServerTranscribed = true;
        } catch (serverErr) {
          console.warn('[Flow Store] ASR Server unavailable or offline. Preserving audio recording:', serverErr);
          const durationSec = (recording.durationMs / 1000).toFixed(1);
          transcribedText = `Voice recording (${durationSec}s)`;
          rawText = transcribedText;
        }

        const entry: HistoryEntry = {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: transcribedText,
          rawText: rawText,
          audioBlob: recording.simulated ? null : recording.blob,
          durationMs: recording.durationMs,
          timestamp: Date.now(),
          styleUsed: style,
          contextUsed: context,
          appTag: fresh.settings.activeAppTag || 'Notes',
          flagged: false,
          fillerRemovedCount: 0,
          correctionsAppliedCount: 0,
          language: 'en',
        };

        await saveHistoryEntry(entry);

        if (isServerTranscribed && transcribedText) {
          await platform.copyToClipboard(entry.text);
          const inserted = await platform.insertText(entry.text);
          get().pushToast(
            inserted ? 'Dictation inserted & copied to clipboard' : 'Dictation copied to clipboard',
            'success'
          );
        } else {
          get().pushToast(
            `Voice recorded (${(recording.durationMs / 1000).toFixed(1)}s) • Saved to History`,
            'default'
          );
        }

        set((s) => ({
          history: [entry, ...s.history],
          overlayState: 'done',
          activeStage: 'polish',
          overlayError: null,
          lastResult: {
            text: entry.text,
            rawText: entry.rawText,
            fillerRemovedCount: entry.fillerRemovedCount,
            correctionsAppliedCount: entry.correctionsAppliedCount,
            timestamp: entry.timestamp,
          },
        }));
        broadcastOverlay();

        doneResetTimer = setTimeout(() => {
          if (get().overlayState === 'done') {
            set({ overlayState: 'idle' });
            broadcastOverlay();
          }
        }, 1400);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transcription failed';
        set({ overlayState: 'error', overlayError: message });
        broadcastOverlay();
        get().pushToast(message, 'error');
        errorResetTimer = setTimeout(() => {
          if (get().overlayState === 'error') {
            set({ overlayState: 'idle', overlayError: null });
            broadcastOverlay();
          }
        }, 4000);
      }
    },

    cancelDictation: () => {
      audioController.cancel();
      set({
        overlayState: 'idle',
        activeStage: 'record',
        overlayError: null,
        audioLevels: Array(10).fill(0.18),
      });
      broadcastOverlay();
    },

    clearOverlayError: () => {
      set({ overlayState: 'idle', overlayError: null });
      broadcastOverlay();
    },

    setTestInputText: (testInputText) => set({ testInputText }),

    appendTestInputText: (value) =>
      set((s) => {
        const trimmed = s.testInputText.trimEnd();
        const next = trimmed ? `${trimmed}\n${value}` : value;
        return { testInputText: next };
      }),

    pushToast: (message, tone = 'default') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
      setTimeout(() => {
        get().dismissToast(id);
      }, 3200);
    },

    dismissToast: (id) =>
      set((s) => ({
        toasts: s.toasts.filter((t) => t.id !== id),
      })),
  };
});
