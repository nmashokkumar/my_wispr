import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Cpu,
  ExternalLink,
  Keyboard,
  Loader2,
  Mic,
  Moon,
  Network,
  RotateCcw,
  Server,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { checkOpenAICompatibleHealth, checkServerHealth } from '../services/api';
import { listAudioInputDevices, type MicDeviceOption } from '../services/audio';
import {
  DEFAULT_HANDS_FREE_HOTKEY,
  DEFAULT_PTT_HOTKEY,
  bindingFromKeyEvent,
  isModifierCode,
} from '../services/hotkeys';
import type { CleanupProvider, DictationMode, HotkeyBinding } from '../types';

type SettingsTab = 'ai_models' | 'hotkeys' | 'microphone' | 'storage';
type LlmScope = 'cleanup' | 'assistant' | 'translation' | 'notes' | 'chat';

export function SettingsModal() {
  const settingsOpen = useFlowStore((s) => s.settingsOpen);
  const setSettingsOpen = useFlowStore((s) => s.setSettingsOpen);
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const setIsCapturingHotkey = useFlowStore((s) => s.setIsCapturingHotkey);
  const clearHistory = useFlowStore((s) => s.clearHistory);
  const historyCount = useFlowStore((s) => s.history.length);

  const [activeTab, setActiveTab] = useState<SettingsTab>('ai_models');
  const [activeScope, setActiveScope] = useState<LlmScope>('cleanup');
  const [mics, setMics] = useState<MicDeviceOption[]>([
    { deviceId: 'default', label: 'System Default Microphone' },
  ]);
  const [capturingTarget, setCapturingTarget] = useState<DictationMode | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [connStatus, setConnStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingSelfHosted, setTestingSelfHosted] = useState(false);
  const [selfHostedStatus, setSelfHostedStatus] = useState<{
    ok: boolean;
    message: string;
    models?: string[];
  } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setIsCapturingHotkey(capturingTarget !== null);
  }, [capturingTarget, setIsCapturingHotkey]);

  useEffect(() => {
    if (!settingsOpen) {
      setConnStatus(null);
      setSelfHostedStatus(null);
      setConfirmClear(false);
      setCapturingTarget(null);
      return;
    }
    void listAudioInputDevices().then(setMics);
  }, [settingsOpen]);

  // Capture either a multi-key combo (e.g. Ctrl + Alt + Space) or a solo key (e.g. Right Ctrl / Fn)
  useEffect(() => {
    if (!capturingTarget) return;

    let pendingSoloModifier: HotkeyBinding | null = null;

    const commitBinding = (binding: HotkeyBinding) => {
      if (capturingTarget === 'push_to_talk') {
        updateSettings({ pushToTalkHotkey: binding });
      } else {
        updateSettings({ handsFreeHotkey: binding });
      }
      setCapturingTarget(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        setCapturingTarget(null);
        return;
      }

      if (isModifierCode(e.code)) {
        pendingSoloModifier = bindingFromKeyEvent(e);
        return;
      }

      pendingSoloModifier = null;
      commitBinding(bindingFromKeyEvent(e));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!pendingSoloModifier) return;
      if (e.code === pendingSoloModifier.code) {
        e.preventDefault();
        e.stopPropagation();
        const binding = pendingSoloModifier;
        pendingSoloModifier = null;
        commitBinding(binding);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [capturingTarget, updateSettings]);

  if (!settingsOpen) return null;

  const handleTestCloudConnection = async () => {
    setTestingConn(true);
    setConnStatus(null);
    const result = await checkServerHealth({
      baseUrl: settings.serverUrl,
      apiKey: settings.apiKey,
      mockMode: settings.mockMode,
    });
    setConnStatus({ ok: result.ok, message: result.message });
    setTestingConn(false);
  };

  const handleTestSelfHostedConnection = async () => {
    setTestingSelfHosted(true);
    setSelfHostedStatus(null);
    const result = await checkOpenAICompatibleHealth({
      baseUrl: settings.selfHostedUrl,
      apiKey: settings.selfHostedApiKey,
    });
    setSelfHostedStatus(result);
    setTestingSelfHosted(false);
  };

  const pttIsDefault =
    settings.pushToTalkHotkey.code === DEFAULT_PTT_HOTKEY.code &&
    !settings.pushToTalkHotkey.ctrl &&
    !settings.pushToTalkHotkey.alt &&
    !settings.pushToTalkHotkey.shift &&
    !settings.pushToTalkHotkey.meta;

  const handsFreeIsDefault =
    settings.handsFreeHotkey.code === DEFAULT_HANDS_FREE_HOTKEY.code &&
    Boolean(settings.handsFreeHotkey.ctrl) === Boolean(DEFAULT_HANDS_FREE_HOTKEY.ctrl) &&
    Boolean(settings.handsFreeHotkey.alt) === Boolean(DEFAULT_HANDS_FREE_HOTKEY.alt) &&
    Boolean(settings.handsFreeHotkey.shift) === Boolean(DEFAULT_HANDS_FREE_HOTKEY.shift) &&
    Boolean(settings.handsFreeHotkey.meta) === Boolean(DEFAULT_HANDS_FREE_HOTKEY.meta);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div className="w-full max-w-[620px] max-h-[92vh] flex flex-col rounded-[22px] bg-[var(--flow-surface)] border border-[var(--flow-border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--flow-border-subtle)] shrink-0">
          <div>
            <h2 id="settings-modal-title" className="text-[17.5px] font-semibold text-[var(--flow-text)]">
              Settings
            </h2>
            <p className="text-[12px] text-[var(--flow-text-muted)]">
              Configure speech-to-text, language models, hotkeys, and devices
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close Settings"
            className="p-1.5 rounded-lg text-[var(--flow-text-secondary)] hover:bg-[var(--flow-surface-hover)] hover:text-[var(--flow-text)] cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-[var(--flow-border-subtle)] bg-[var(--flow-surface-muted)] shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('ai_models')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'ai_models'
                ? 'border-[var(--flow-accent)] text-[var(--flow-text)]'
                : 'border-transparent text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
            }`}
          >
            <Sparkles size={14} className={activeTab === 'ai_models' ? 'text-[var(--flow-accent)]' : ''} />
            AI Models
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hotkeys')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'hotkeys'
                ? 'border-[var(--flow-accent)] text-[var(--flow-text)]'
                : 'border-transparent text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
            }`}
          >
            <Keyboard size={14} className={activeTab === 'hotkeys' ? 'text-[var(--flow-accent)]' : ''} />
            Hotkeys
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('microphone')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'microphone'
                ? 'border-[var(--flow-accent)] text-[var(--flow-text)]'
                : 'border-transparent text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
            }`}
          >
            <Mic size={14} className={activeTab === 'microphone' ? 'text-[var(--flow-accent)]' : ''} />
            Microphone
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('storage')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-[12.5px] font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'storage'
                ? 'border-[var(--flow-accent)] text-[var(--flow-text)]'
                : 'border-transparent text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
            }`}
          >
            <Sliders size={14} className={activeTab === 'storage' ? 'text-[var(--flow-accent)]' : ''} />
            Storage &amp; Theme
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: AI MODELS (LANGUAGE MODEL & CLEANUP) */}
          {activeTab === 'ai_models' && (
            <div className="space-y-6">
              {/* Language Model Header matching Wispr Flow screenshot */}
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--flow-text)]">Language Model</h3>
                <p className="text-[12px] text-[var(--flow-text-muted)]">
                  Configure models for cleanup, note formatting, and chat
                </p>
              </div>

              {/* Sub-tabs: Dictation Cleanup, Voice Assistant, Translation, Note Formatting, Chat */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-[12px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)]">
                <button
                  type="button"
                  onClick={() => setActiveScope('cleanup')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-colors cursor-pointer ${
                    activeScope === 'cleanup'
                      ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                      : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
                  }`}
                >
                  <Sparkles size={13} className="text-[var(--flow-accent)]" />
                  Dictation Cleanup
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming in future release"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11.5px] text-[var(--flow-text-muted)] opacity-60 cursor-not-allowed"
                >
                  Voice Assistant
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming in future release"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11.5px] text-[var(--flow-text-muted)] opacity-60 cursor-not-allowed"
                >
                  Translation
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming in future release"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11.5px] text-[var(--flow-text-muted)] opacity-60 cursor-not-allowed"
                >
                  Note Formatting
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming in future release"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[11.5px] text-[var(--flow-text-muted)] opacity-60 cursor-not-allowed"
                >
                  Chat
                </button>
              </div>

              {/* Text Cleanup Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-[12px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)]">
                <div>
                  <div className="text-[13px] font-medium text-[var(--flow-text)]">
                    Enable text cleanup
                  </div>
                  <div className="text-[11.5px] text-[var(--flow-text-muted)]">
                    Use AI to remove filler words, fix grammar, and polish punctuation
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.textCleanupEnabled}
                    onChange={(e) => updateSettings({ textCleanupEnabled: e.target.checked })}
                    className="sr-only peer"
                    aria-label="Enable text cleanup"
                  />
                  <span className="w-10 h-6 bg-[var(--flow-border)] peer-checked:bg-[var(--flow-accent)] rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
              </div>

              {/* Provider Selection Cards */}
              <div className="space-y-2.5">
                {/* 1. Dedicated Cloud Server (Default / Primary) */}
                <div
                  onClick={() => updateSettings({ cleanupProvider: 'cloud' })}
                  className={`p-4 rounded-[14px] border transition-all cursor-pointer ${
                    settings.cleanupProvider === 'cloud'
                      ? 'border-[var(--flow-accent)] bg-[var(--flow-accent-soft)]/20 shadow-xs'
                      : 'border-[var(--flow-border)] bg-[var(--flow-panel-bg)] hover:border-[var(--flow-text-muted)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-[10px] mt-0.5 ${
                          settings.cleanupProvider === 'cloud'
                            ? 'bg-[var(--flow-accent)] text-white'
                            : 'bg-[var(--flow-surface-muted)] text-[var(--flow-text-secondary)]'
                        }`}
                      >
                        <Cloud size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-semibold text-[var(--flow-text)]">
                            Dedicated Cloud Server
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Active · Recommended
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--flow-text-muted)] mt-0.5">
                          Reliable accuracy. Layer 1 Parakeet 0.6B INT8 ASR + Layer 2 Qwen 2.5 3B cleanup with live intermediate clauses.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center h-5">
                      <input
                        type="radio"
                        name="cleanupProvider"
                        checked={settings.cleanupProvider === 'cloud'}
                        onChange={() => updateSettings({ cleanupProvider: 'cloud' })}
                        className="w-4 h-4 text-[var(--flow-accent)] border-[var(--flow-border)] cursor-pointer"
                      />
                    </div>
                  </div>

                  {settings.cleanupProvider === 'cloud' && (
                    <div className="mt-4 pt-3.5 border-t border-[var(--flow-border-subtle)] space-y-3">
                      <div>
                        <label
                          htmlFor="setting-server-url"
                          className="block text-[11.5px] font-medium text-[var(--flow-text-secondary)] mb-1"
                        >
                          Server Base URL
                        </label>
                        <input
                          id="setting-server-url"
                          type="url"
                          value={settings.serverUrl}
                          onChange={(e) => updateSettings({ serverUrl: e.target.value })}
                          placeholder="https://8000-agq75oq6i7eazd5pahfhehvvj4.instabox.tech"
                          className="w-full h-9 rounded-[9px] border border-[var(--flow-border)] bg-[var(--flow-surface)] px-3 text-[12.5px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)] font-mono"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <button
                          type="button"
                          onClick={handleTestCloudConnection}
                          disabled={testingConn}
                          className="inline-flex items-center gap-2 rounded-[9px] bg-[var(--flow-primary-btn)] hover:bg-[var(--flow-primary-btn-hover)] text-[var(--flow-primary-btn-text)] px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {testingConn && <Loader2 size={13} className="animate-spin" />}
                          Test cloud connection
                        </button>
                        <label className="inline-flex items-center gap-2 text-[11.5px] text-[var(--flow-text-muted)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={settings.mockMode}
                            onChange={(e) => updateSettings({ mockMode: e.target.checked })}
                            className="rounded border-[var(--flow-border)]"
                          />
                          <span>Mock mode (offline simulation)</span>
                        </label>
                      </div>

                      {connStatus && (
                        <div
                          className={`flex items-start gap-2 rounded-[9px] px-3 py-2 text-[12px] ${
                            connStatus.ok
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20'
                          }`}
                        >
                          {connStatus.ok ? (
                            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          )}
                          <span>{connStatus.message}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Self-Hosted (LAN / Local) */}
                <div
                  onClick={() => updateSettings({ cleanupProvider: 'self_hosted' })}
                  className={`p-4 rounded-[14px] border transition-all cursor-pointer ${
                    settings.cleanupProvider === 'self_hosted'
                      ? 'border-[var(--flow-accent)] bg-[var(--flow-accent-soft)]/20 shadow-xs'
                      : 'border-[var(--flow-border)] bg-[var(--flow-panel-bg)] hover:border-[var(--flow-text-muted)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-[10px] mt-0.5 ${
                          settings.cleanupProvider === 'self_hosted'
                            ? 'bg-[var(--flow-accent)] text-white'
                            : 'bg-[var(--flow-surface-muted)] text-[var(--flow-text-secondary)]'
                        }`}
                      >
                        <Network size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-semibold text-[var(--flow-text)]">
                            Self-Hosted
                          </span>
                          {settings.cleanupProvider === 'self_hosted' && (
                            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[var(--flow-text-muted)] mt-0.5">
                          Your own server on your network (e.g. Ollama, LM Studio, vLLM, or llama-server).
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center h-5">
                      <input
                        type="radio"
                        name="cleanupProvider"
                        checked={settings.cleanupProvider === 'self_hosted'}
                        onChange={() => updateSettings({ cleanupProvider: 'self_hosted' })}
                        className="w-4 h-4 text-[var(--flow-accent)] border-[var(--flow-border)] cursor-pointer"
                      />
                    </div>
                  </div>

                  {settings.cleanupProvider === 'self_hosted' && (
                    <div className="mt-4 pt-3.5 border-t border-[var(--flow-border-subtle)] space-y-3">
                      <div>
                        <label
                          htmlFor="setting-selfhosted-url"
                          className="block text-[11.5px] font-medium text-[var(--flow-text-secondary)] mb-1"
                        >
                          Endpoint URL
                        </label>
                        <input
                          id="setting-selfhosted-url"
                          type="url"
                          value={settings.selfHostedUrl}
                          onChange={(e) => updateSettings({ selfHostedUrl: e.target.value })}
                          placeholder="http://192.168.1.126:11434/v1"
                          className="w-full h-9 rounded-[9px] border border-[var(--flow-border)] bg-[var(--flow-surface)] px-3 text-[12.5px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)] font-mono"
                        />
                        <p className="mt-1 text-[11px] text-[var(--flow-text-muted)]">
                          Point to an OpenAI-compatible server on your local network (e.g. Ollama, LM Studio, vLLM, or llama-server).
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="setting-selfhosted-model"
                            className="block text-[11.5px] font-medium text-[var(--flow-text-secondary)] mb-1"
                          >
                            Model Name
                          </label>
                          <input
                            id="setting-selfhosted-model"
                            type="text"
                            value={settings.selfHostedModel}
                            onChange={(e) => updateSettings({ selfHostedModel: e.target.value })}
                            placeholder="qwen2.5:3b"
                            className="w-full h-9 rounded-[9px] border border-[var(--flow-border)] bg-[var(--flow-surface)] px-3 text-[12.5px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)] font-mono"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="setting-selfhosted-key"
                            className="block text-[11.5px] font-medium text-[var(--flow-text-secondary)] mb-1"
                          >
                            API Key (Optional)
                          </label>
                          <input
                            id="setting-selfhosted-key"
                            type="password"
                            value={settings.selfHostedApiKey}
                            onChange={(e) => updateSettings({ selfHostedApiKey: e.target.value })}
                            placeholder="Paste your API key"
                            className="w-full h-9 rounded-[9px] border border-[var(--flow-border)] bg-[var(--flow-surface)] px-3 text-[12.5px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                          />
                        </div>
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleTestSelfHostedConnection}
                          disabled={testingSelfHosted}
                          className="inline-flex items-center gap-2 rounded-[9px] bg-[var(--flow-primary-btn)] hover:bg-[var(--flow-primary-btn-hover)] text-[var(--flow-primary-btn-text)] px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-60"
                        >
                          {testingSelfHosted && <Loader2 size={13} className="animate-spin" />}
                          Test self-hosted connection
                        </button>
                      </div>

                      {selfHostedStatus && (
                        <div
                          className={`flex items-start gap-2 rounded-[9px] px-3 py-2 text-[12px] ${
                            selfHostedStatus.ok
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20'
                          }`}
                        >
                          {selfHostedStatus.ok ? (
                            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div>{selfHostedStatus.message}</div>
                            {selfHostedStatus.models && selfHostedStatus.models.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {selfHostedStatus.models.slice(0, 5).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => updateSettings({ selfHostedModel: m })}
                                    className="px-1.5 py-0.5 text-[10.5px] font-mono rounded bg-[var(--flow-surface)] border border-[var(--flow-border)] text-[var(--flow-text)] hover:border-[var(--flow-accent)] cursor-pointer"
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. OpenWhispr Cloud (Reference / Placeholder) */}
                <div className="p-3.5 rounded-[14px] border border-[var(--flow-border-subtle)] bg-[var(--flow-panel-bg)]/50 opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-[10px] bg-[var(--flow-surface-muted)] text-[var(--flow-text-muted)]">
                        <Cloud size={16} />
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-[var(--flow-text)]">
                          OpenWhispr Cloud
                        </div>
                        <div className="text-[11.5px] text-[var(--flow-text-muted)]">
                          Reliable accuracy. No setup needed.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10.5px] text-[var(--flow-text-muted)]">Cloud Service</span>
                  </div>
                </div>

                {/* 4. Local On-Device (Reference / Placeholder) */}
                <div className="p-3.5 rounded-[14px] border border-[var(--flow-border-subtle)] bg-[var(--flow-panel-bg)]/50 opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-[10px] bg-[var(--flow-surface-muted)] text-[var(--flow-text-muted)]">
                        <Cpu size={16} />
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-[var(--flow-text)]">Local</div>
                        <div className="text-[11.5px] text-[var(--flow-text-muted)]">
                          On-device models. Fully private.
                        </div>
                      </div>
                    </div>
                    <span className="text-[10.5px] text-[var(--flow-text-muted)]">Coming Soon</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HOTKEYS */}
          {activeTab === 'hotkeys' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--flow-text)]">Global Hotkeys</h3>
                <p className="text-[12px] text-[var(--flow-text-muted)]">
                  Both shortcuts are active anywhere on Linux. Pressing will dictate and auto-paste into your active window.
                </p>
              </div>

              {/* Dual Custom Hotkey Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Push-to-talk hotkey */}
                <div className="p-4 rounded-[14px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12.5px] font-medium text-[var(--flow-text)]">
                      Push-to-talk Hotkey
                    </span>
                    {!pttIsDefault && (
                      <button
                        type="button"
                        onClick={() => updateSettings({ pushToTalkHotkey: DEFAULT_PTT_HOTKEY })}
                        className="inline-flex items-center gap-1 text-[11px] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        Reset
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCapturingTarget(capturingTarget === 'push_to_talk' ? null : 'push_to_talk')
                    }
                    className={`w-full h-10 flex items-center justify-between gap-2 rounded-[10px] border px-3 text-[13px] transition-colors cursor-pointer ${
                      capturingTarget === 'push_to_talk'
                        ? 'border-[var(--flow-accent)] bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] font-medium'
                        : 'border-[var(--flow-border)] bg-[var(--flow-surface)] text-[var(--flow-text)] hover:border-[var(--flow-text-muted)]'
                    }`}
                  >
                    <span className="truncate font-medium">
                      {capturingTarget === 'push_to_talk'
                        ? 'Press key or combo…'
                        : settings.pushToTalkHotkey.label}
                    </span>
                    <span className="text-[11px] opacity-70 shrink-0">
                      {capturingTarget === 'push_to_talk' ? 'Esc' : 'Change'}
                    </span>
                  </button>
                  <p className="mt-2 text-[11px] text-[var(--flow-text-muted)]">
                    Hold to record, release to transcribe &amp; paste
                  </p>
                </div>

                {/* Hands-free hotkey */}
                <div className="p-4 rounded-[14px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12.5px] font-medium text-[var(--flow-text)]">
                      Hands-free Hotkey
                    </span>
                    {!handsFreeIsDefault && (
                      <button
                        type="button"
                        onClick={() => updateSettings({ handsFreeHotkey: DEFAULT_HANDS_FREE_HOTKEY })}
                        className="inline-flex items-center gap-1 text-[11px] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        Reset
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setCapturingTarget(capturingTarget === 'hands_free' ? null : 'hands_free')
                    }
                    className={`w-full h-10 flex items-center justify-between gap-2 rounded-[10px] border px-3 text-[13px] transition-colors cursor-pointer ${
                      capturingTarget === 'hands_free'
                        ? 'border-[var(--flow-accent)] bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] font-medium'
                        : 'border-[var(--flow-border)] bg-[var(--flow-surface)] text-[var(--flow-text)] hover:border-[var(--flow-text-muted)]'
                    }`}
                  >
                    <span className="truncate font-medium">
                      {capturingTarget === 'hands_free'
                        ? 'Press key or combo…'
                        : settings.handsFreeHotkey.label}
                    </span>
                    <span className="text-[11px] opacity-70 shrink-0">
                      {capturingTarget === 'hands_free' ? 'Esc' : 'Change'}
                    </span>
                  </button>
                  <p className="mt-2 text-[11px] text-[var(--flow-text-muted)]">
                    Press once to start, press again or Esc to finish
                  </p>
                </div>
              </div>

              {/* Default Dictation Mode */}
              <div className="p-4 rounded-[14px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)]">
                <span className="block text-[12.5px] font-medium text-[var(--flow-text)] mb-2">
                  Default Mode (Overlay Pill &amp; Dictate Button)
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-[10px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)]">
                  <button
                    type="button"
                    onClick={() => updateSettings({ dictationMode: 'push_to_talk' })}
                    className={`rounded-[8px] py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                      settings.dictationMode === 'push_to_talk'
                        ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                        : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
                    }`}
                  >
                    Push-to-talk ({settings.pushToTalkHotkey.label})
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ dictationMode: 'hands_free' })}
                    className={`rounded-[8px] py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                      settings.dictationMode === 'hands_free'
                        ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                        : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
                    }`}
                  >
                    Hands-free ({settings.handsFreeHotkey.label})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MICROPHONE */}
          {activeTab === 'microphone' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--flow-text)]">
                  Audio &amp; Microphone
                </h3>
                <p className="text-[12px] text-[var(--flow-text-muted)]">
                  Select your microphone and configure hands-free silence auto-stop
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-[14px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)]">
                  <label
                    htmlFor="setting-mic-device"
                    className="block text-[12.5px] font-medium text-[var(--flow-text)] mb-1.5"
                  >
                    Microphone Input Device
                  </label>
                  <select
                    id="setting-mic-device"
                    value={settings.micDeviceId}
                    onChange={(e) => updateSettings({ micDeviceId: e.target.value })}
                    className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-surface)] px-3 text-[13px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                  >
                    {mics.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-[14px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)]">
                  <label
                    htmlFor="setting-silence-timeout"
                    className="block text-[12.5px] font-medium text-[var(--flow-text)] mb-1.5"
                  >
                    Silence Auto-Stop Threshold (Hands-free Mode)
                  </label>
                  <select
                    id="setting-silence-timeout"
                    value={settings.silenceTimeoutSec}
                    onChange={(e) => updateSettings({ silenceTimeoutSec: Number(e.target.value) })}
                    className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-surface)] px-3 text-[13px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                  >
                    <option value={0}>Disabled (manual stop only)</option>
                    <option value={2}>2 seconds</option>
                    <option value={3}>3 seconds</option>
                    <option value={5}>5 seconds (default)</option>
                    <option value={8}>8 seconds</option>
                  </select>
                  <p className="mt-1.5 text-[11.5px] text-[var(--flow-text-muted)]">
                    In Hands-free mode, dictation stops automatically after this period of continuous silence.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STORAGE & THEME */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--flow-text)]">
                  Storage &amp; Appearance
                </h3>
                <p className="text-[12px] text-[var(--flow-text-muted)]">
                  Manage local IndexedDB audio cache, history, and theme
                </p>
              </div>

              <div className="p-4 rounded-[14px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)] flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-[var(--flow-text)]">Theme Mode</div>
                  <div className="text-[11.5px] text-[var(--flow-text-muted)]">
                    Switch between dark and light appearance
                  </div>
                </div>
                <div className="inline-flex items-center gap-1 p-1 rounded-[10px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)]">
                  <button
                    type="button"
                    onClick={() => updateSettings({ theme: 'light' })}
                    className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-medium cursor-pointer ${
                      settings.theme === 'light'
                        ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                        : 'text-[var(--flow-text-secondary)]'
                    }`}
                  >
                    <Sun size={13} />
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ theme: 'dark' })}
                    className={`inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[12px] font-medium cursor-pointer ${
                      settings.theme === 'dark'
                        ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                        : 'text-[var(--flow-text-secondary)]'
                    }`}
                  >
                    <Moon size={13} />
                    Dark
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-[14px] bg-[var(--flow-panel-bg)] border border-[var(--flow-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-medium text-[var(--flow-text)]">
                      Local Dictation History &amp; Audio
                    </div>
                    <div className="text-[11.5px] text-[var(--flow-text-muted)]">
                      {historyCount} recorded entries stored strictly in browser IndexedDB (flow-dictation-db).
                    </div>
                  </div>
                  {!confirmClear ? (
                    <button
                      type="button"
                      disabled={historyCount === 0}
                      onClick={() => setConfirmClear(true)}
                      className="inline-flex items-center gap-1.5 rounded-[9px] border border-red-500/30 px-3 py-1.5 text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                      Clear all ({historyCount})
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void clearHistory();
                          setConfirmClear(false);
                        }}
                        className="rounded-[8px] bg-red-600 hover:bg-red-700 text-white px-3 py-1 text-[12px] font-medium cursor-pointer"
                      >
                        Confirm delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="rounded-[8px] border border-[var(--flow-border)] px-2 py-1 text-[12px] text-[var(--flow-text-secondary)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <a
                  href="/overlay"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] transition-colors"
                >
                  <span>Preview /overlay route in browser tab</span>
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
