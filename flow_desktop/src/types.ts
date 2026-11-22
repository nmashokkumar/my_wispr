export type NavPage = 'dictation' | 'insights' | 'dictionary' | 'style';

export type StyleContext = 'personal' | 'work' | 'email' | 'other';
export type StyleTab = StyleContext | 'auto_cleanup';
export type StylePreset = 'formal' | 'casual' | 'very_casual';

export type DictationMode = 'push_to_talk' | 'hands_free';

export type DictationOverlayState = 'idle' | 'listening' | 'transcribing' | 'done' | 'error';

export type DictationStage = 'record' | 'transcribe' | 'cleanup' | 'polish';

export interface AutoCleanupConfig {
  removeFillerWords: boolean;
  applySelfCorrections: boolean;
  autoPunctuation: boolean;
  autoCapitalization: boolean;
}

export interface DictionaryEntry {
  id: string;
  type: 'word' | 'replacement';
  /** Plain word to spell accurately, or the spoken trigger for a replacement */
  trigger: string;
  /** Target replacement phrase (only used when type === 'replacement') */
  replacement?: string;
  starred: boolean;
  scope: 'personal';
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  text: string;
  rawText: string;
  audioBlob?: Blob | null;
  durationMs: number;
  timestamp: number;
  styleUsed: StylePreset;
  contextUsed: StyleContext;
  appTag: string;
  flagged: boolean;
  fillerRemovedCount: number;
  correctionsAppliedCount: number;
  language: string;
}

export interface HotkeyBinding {
  code: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  label: string;
}

export type LlmProvider = 'cloud' | 'byok' | 'local' | 'self_hosted' | 'enterprise';
export type SttProvider = 'flow_server' | 'self_hosted' | 'mock';

export interface AppSettings {
  serverUrl: string;
  apiKey: string;
  pushToTalkHotkey: HotkeyBinding;
  handsFreeHotkey: HotkeyBinding;
  dictationMode: DictationMode;
  micDeviceId: string;
  silenceTimeoutSec: number;
  mockMode: boolean;
  theme: 'light' | 'dark';
  activeContext: StyleContext;
  activeAppTag: string;

  // Speech to Text configuration
  sttProvider: SttProvider;
  sttEndpointUrl: string;
  sttApiKey?: string;

  // Language Model (AI text cleanup & polish)
  enableAiCleanup: boolean;
  llmProvider: LlmProvider;
  llmEndpointUrl: string;
  llmApiKey?: string;
  llmModel?: string;
}

export interface TranscribeResponse {
  text: string;
  raw_text: string;
  language: string;
  duration_ms: number;
}

export interface PipelineTransformResult {
  text: string;
  fillerRemovedCount: number;
  correctionsAppliedCount: number;
  dictionaryAppliedCount: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  tone: 'default' | 'success' | 'error';
}
