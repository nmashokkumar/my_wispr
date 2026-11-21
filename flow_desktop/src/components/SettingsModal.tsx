import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Keyboard,
  Loader2,
  Moon,
  RotateCcw,
  Server,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { checkServerHealth } from '../services/api';
import { listAudioInputDevices, type MicDeviceOption } from '../services/audio';
import {
  DEFAULT_HANDS_FREE_HOTKEY,
  DEFAULT_PTT_HOTKEY,
  bindingFromKeyEvent,
  isModifierCode,
} from '../services/hotkeys';
import type { DictationMode, HotkeyBinding } from '../types';

export function SettingsModal() {
  const settingsOpen = useFlowStore((s) => s.settingsOpen);
  const setSettingsOpen = useFlowStore((s) => s.setSettingsOpen);
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const setIsCapturingHotkey = useFlowStore((s) => s.setIsCapturingHotkey);
  const clearHistory = useFlowStore((s) => s.clearHistory);
  const resetAllState = useFlowStore((s) => s.resetAllState);
  const historyCount = useFlowStore((s) => s.history.length);

  const [mics, setMics] = useState<MicDeviceOption[]>([
    { deviceId: 'default', label: 'System Default Microphone' },
  ]);
  const [capturingTarget, setCapturingTarget] = useState<DictationMode | null>(null);
  const [testingConn, setTestingConn] = useState(false);
  const [connStatus, setConnStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setIsCapturingHotkey(capturingTarget !== null);
  }, [capturingTarget, setIsCapturingHotkey]);

  useEffect(() => {
    if (!settingsOpen) {
      setConnStatus(null);
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
        // Hold modifier in case user presses a second key for a combo (e.g. Ctrl + Alt + Space)
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

  const handleTestConnection = async () => {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto rounded-[20px] bg-[var(--flow-surface)] border border-[var(--flow-border)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--flow-border-subtle)] sticky top-0 bg-[var(--flow-surface)] z-10">
          <div>
            <h2 id="settings-modal-title" className="text-[18px] font-semibold text-[var(--flow-text)]">
              Settings
            </h2>
            <p className="text-[12.5px] text-[var(--flow-text-muted)]">
              Configure transcription server, hotkeys, microphone, and local storage
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close Settings"
            className="p-2 rounded-lg text-[var(--flow-text-secondary)] hover:bg-[var(--flow-surface-hover)] hover:text-[var(--flow-text)] cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Backend Connection */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13.5px] font-semibold text-[var(--flow-text)] flex items-center gap-2">
                <Server size={15} className="text-[var(--flow-text-secondary)]" />
                Transcription Server
              </h3>
              <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--flow-text-secondary)] cursor-pointer select-none">
                <span>Mock mode</span>
                <input
                  type="checkbox"
                  checked={settings.mockMode}
                  onChange={(e) => {
                    updateSettings({ mockMode: e.target.checked });
                    setConnStatus(null);
                  }}
                  aria-label="Enable Mock mode"
                  className="sr-only peer"
                />
                <span className="relative w-9 h-5 rounded-full bg-[var(--flow-border)] peer-checked:bg-[var(--flow-accent)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="setting-server-url"
                  className="block text-[12px] font-medium text-[var(--flow-text-secondary)] mb-1.5"
                >
                  Server Base URL
                </label>
                <input
                  id="setting-server-url"
                  type="url"
                  value={settings.serverUrl}
                  onChange={(e) => updateSettings({ serverUrl: e.target.value })}
                  placeholder="http://localhost:8000"
                  className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] px-3 text-[13.5px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                />
              </div>

              <div>
                <label
                  htmlFor="setting-api-key"
                  className="block text-[12px] font-medium text-[var(--flow-text-secondary)] mb-1.5"
                >
                  API Key (optional)
                </label>
                <input
                  id="setting-api-key"
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => updateSettings({ apiKey: e.target.value })}
                  placeholder="Sent via X-API-Key & Authorization Bearer header"
                  className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] px-3 text-[13.5px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConn}
                  className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--flow-primary-btn)] hover:bg-[var(--flow-primary-btn-hover)] text-[var(--flow-primary-btn-text)] px-3.5 py-2 text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-60"
                >
                  {testingConn && <Loader2 size={14} className="animate-spin" />}
                  Test connection
                </button>

                <a
                  href="/overlay"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] transition-colors"
                >
                  <span>Preview /overlay route</span>
                  <ExternalLink size={13} />
                </a>
              </div>

              {connStatus && (
                <div
                  className={`flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px] ${
                    connStatus.ok
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20'
                  }`}
                >
                  {connStatus.ok ? (
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  )}
                  <span>{connStatus.message}</span>
                </div>
              )}
            </div>
          </section>

          <hr className="border-[var(--flow-border-subtle)]" />

          {/* Hotkeys & Dictation Mode — both custom hotkeys always active */}
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13.5px] font-semibold text-[var(--flow-text)] flex items-center gap-2">
                <Keyboard size={15} className="text-[var(--flow-text-secondary)]" />
                Hotkeys &amp; Dictation Mode
              </h3>
              <span className="text-[11.5px] text-[var(--flow-text-muted)]">
                Both shortcuts work anytime
              </span>
            </div>

            {/* Dual Custom Hotkey Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Push-to-talk hotkey */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-[var(--flow-text-secondary)]">
                    Push-to-talk Hotkey
                  </span>
                  {!pttIsDefault && (
                    <button
                      type="button"
                      onClick={() => updateSettings({ pushToTalkHotkey: DEFAULT_PTT_HOTKEY })}
                      aria-label="Reset Push-to-talk hotkey to fn"
                      title="Reset to default (fn)"
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
                    >
                      <RotateCcw size={11} />
                      Reset
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Change Push-to-talk hotkey"
                  onClick={() =>
                    setCapturingTarget(capturingTarget === 'push_to_talk' ? null : 'push_to_talk')
                  }
                  className={`w-full h-10 flex items-center justify-between gap-2 rounded-[10px] border px-3 text-[13px] transition-colors cursor-pointer ${
                    capturingTarget === 'push_to_talk'
                      ? 'border-[var(--flow-accent)] bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] font-medium'
                      : 'border-[var(--flow-border)] bg-[var(--flow-panel-bg)] text-[var(--flow-text)] hover:border-[var(--flow-text-muted)]'
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
                <p className="mt-1 text-[11px] text-[var(--flow-text-muted)]">
                  Hold to record, release to send
                </p>
              </div>

              {/* Hands-free hotkey */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-medium text-[var(--flow-text-secondary)]">
                    Hands-free Hotkey
                  </span>
                  {!handsFreeIsDefault && (
                    <button
                      type="button"
                      onClick={() => updateSettings({ handsFreeHotkey: DEFAULT_HANDS_FREE_HOTKEY })}
                      aria-label="Reset Hands-free hotkey to Ctrl + Alt + Space"
                      title="Reset to default (Ctrl + Alt + Space)"
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
                    >
                      <RotateCcw size={11} />
                      Reset
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Change Hands-free hotkey"
                  onClick={() =>
                    setCapturingTarget(capturingTarget === 'hands_free' ? null : 'hands_free')
                  }
                  className={`w-full h-10 flex items-center justify-between gap-2 rounded-[10px] border px-3 text-[13px] transition-colors cursor-pointer ${
                    capturingTarget === 'hands_free'
                      ? 'border-[var(--flow-accent)] bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] font-medium'
                      : 'border-[var(--flow-border)] bg-[var(--flow-panel-bg)] text-[var(--flow-text)] hover:border-[var(--flow-text-muted)]'
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
                <p className="mt-1 text-[11px] text-[var(--flow-text-muted)]">
                  Press once to start, again or Esc to stop
                </p>
              </div>
            </div>

            {typeof window !== 'undefined' && window.electronAPI && (
              <div className="flex items-center gap-2 p-2 rounded-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11.5px]">
                <CheckCircle2 size={13} className="shrink-0" />
                <span>
                  Global Linux hotkeys registered: Press hotkey anywhere (Terminal, Chrome, VS Code) to activate dictation pill.
                </span>
              </div>
            )}

            {/* Active / Default Dictation Mode */}
            <div>
              <span className="block text-[12px] font-medium text-[var(--flow-text-secondary)] mb-1.5">
                Default Mode (Overlay &amp; Dictate button)
              </span>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)]">
                <button
                  type="button"
                  onClick={() => updateSettings({ dictationMode: 'push_to_talk' })}
                  className={`rounded-[7px] py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
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
                  className={`rounded-[7px] py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                    settings.dictationMode === 'hands_free'
                      ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                      : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
                  }`}
                >
                  Hands-free ({settings.handsFreeHotkey.label})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="setting-mic-device"
                  className="block text-[12px] font-medium text-[var(--flow-text-secondary)] mb-1.5"
                >
                  Microphone Input
                </label>
                <select
                  id="setting-mic-device"
                  value={settings.micDeviceId}
                  onChange={(e) => updateSettings({ micDeviceId: e.target.value })}
                  className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] px-3 text-[13px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                >
                  {mics.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="setting-silence-timeout"
                  className="block text-[12px] font-medium text-[var(--flow-text-secondary)] mb-1.5"
                >
                  Silence Auto-Stop (Hands-free)
                </label>
                <select
                  id="setting-silence-timeout"
                  value={settings.silenceTimeoutSec}
                  onChange={(e) => updateSettings({ silenceTimeoutSec: Number(e.target.value) })}
                  className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] px-3 text-[13px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                >
                  <option value={0}>Disabled (manual stop)</option>
                  <option value={2}>2 seconds</option>
                  <option value={3}>3 seconds (default)</option>
                  <option value={5}>5 seconds</option>
                  <option value={8}>8 seconds</option>
                </select>
              </div>
            </div>
          </section>

          <hr className="border-[var(--flow-border-subtle)]" />

          {/* Appearance & Data */}
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-medium text-[var(--flow-text)]">Appearance</span>
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void resetAllState();
                  setConfirmClear(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-surface-muted)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] transition-colors cursor-pointer"
                title="Reset all settings, dictionary, and history to fresh defaults"
              >
                <RotateCcw size={13} />
                Reset All (Fresh Slate)
              </button>

              {!confirmClear ? (
                <button
                  type="button"
                  disabled={historyCount === 0}
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-red-500/30 px-3 py-1.5 text-[12.5px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Trash2 size={14} />
                  Clear history ({historyCount})
                </button>
              ) : (
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void clearHistory();
                      setConfirmClear(false);
                    }}
                    className="rounded-[8px] bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-[12px] font-medium cursor-pointer"
                  >
                    Confirm delete all
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-[8px] border border-[var(--flow-border)] px-2.5 py-1.5 text-[12px] text-[var(--flow-text-secondary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
