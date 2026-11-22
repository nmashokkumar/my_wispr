import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Cloud,
  Cpu,
  CreditCard,
  FileText,
  Key,
  Keyboard,
  Languages,
  Loader2,
  MessageSquare,
  Mic,
  Moon,
  Network,
  RotateCcw,
  Server,
  Share2,
  Shield,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  User,
  Wrench,
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
import type { DictationMode, HotkeyBinding, LlmProvider, SttProvider } from '../types';

type SettingsSidebarTab =
  | 'language_model'
  | 'speech_to_text'
  | 'hotkeys'
  | 'preferences'
  | 'tone_style'
  | 'privacy_data'
  | 'system';

type LanguageModelSubTab =
  | 'dictation_cleanup'
  | 'voice_assistant'
  | 'translation'
  | 'note_formatting'
  | 'chat';

export function SettingsModal() {
  const settingsOpen = useFlowStore((s) => s.settingsOpen);
  const setSettingsOpen = useFlowStore((s) => s.setSettingsOpen);
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const setIsCapturingHotkey = useFlowStore((s) => s.setIsCapturingHotkey);
  const clearHistory = useFlowStore((s) => s.clearHistory);
  const resetAllState = useFlowStore((s) => s.resetAllState);
  const historyCount = useFlowStore((s) => s.history.length);

  const [activeTab, setActiveTab] = useState<SettingsSidebarTab>('language_model');
  const [llmSubTab, setLlmSubTab] = useState<LanguageModelSubTab>('dictation_cleanup');
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

  // Capture hotkey combo or solo key
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

  const handleTestConnection = async (targetUrl: string, apiKey?: string) => {
    setTestingConn(true);
    setConnStatus(null);
    const result = await checkServerHealth({
      baseUrl: targetUrl,
      apiKey: apiKey,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div className="w-full max-w-[960px] h-[640px] max-h-[92vh] flex rounded-[16px] bg-[#141416] text-[#E4E4E7] border border-[#27272A] shadow-2xl overflow-hidden font-sans">
        {/* Left Sidebar */}
        <aside className="w-[220px] shrink-0 border-r border-[#27272A] bg-[#0E0E10] flex flex-col justify-between p-3">
          <div className="space-y-4">
            {/* User Pill Header matching screenshot */}
            <div className="flex items-center justify-between p-2 rounded-[10px] hover:bg-[#1F1F23] cursor-pointer transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-full bg-[#1E293B] border border-[#334155] flex items-center justify-center text-[11px] font-semibold text-[#38BDF8] shrink-0">
                  AW
                </span>
                <span className="text-[13px] font-medium text-[#F4F4F5] truncate">
                  Ashok kumar N's...
                </span>
              </div>
            </div>

            {/* Account Group */}
            <div className="space-y-0.5">
              <span className="px-2 text-[11px] font-semibold tracking-wider uppercase text-[#71717A]">
                Account
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('preferences')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                  activeTab === 'preferences'
                    ? 'bg-[#27272A] text-white'
                    : 'text-[#A1A1AA] hover:bg-[#1F1F23] hover:text-white'
                }`}
              >
                <Sliders size={15} />
                <span>Preferences</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tone_style')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                  activeTab === 'tone_style'
                    ? 'bg-[#27272A] text-white'
                    : 'text-[#A1A1AA] hover:bg-[#1F1F23] hover:text-white'
                }`}
              >
                <Sparkles size={15} />
                <span>Tone &amp; Style</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hotkeys')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                  activeTab === 'hotkeys'
                    ? 'bg-[#27272A] text-white'
                    : 'text-[#A1A1AA] hover:bg-[#1F1F23] hover:text-white'
                }`}
              >
                <Keyboard size={15} />
                <span>Hotkeys</span>
              </button>
            </div>

            {/* AI Models Group */}
            <div className="space-y-0.5">
              <span className="px-2 text-[11px] font-semibold tracking-wider uppercase text-[#71717A]">
                AI Models
              </span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('speech_to_text');
                  setConnStatus(null);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                  activeTab === 'speech_to_text'
                    ? 'bg-[#27272A] text-white'
                    : 'text-[#A1A1AA] hover:bg-[#1F1F23] hover:text-white'
                }`}
              >
                <Mic size={15} />
                <span>Speech to Text</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('language_model');
                  setConnStatus(null);
                }}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                  activeTab === 'language_model'
                    ? 'bg-[#27272A] text-white font-semibold'
                    : 'text-[#A1A1AA] hover:bg-[#1F1F23] hover:text-white'
                }`}
              >
                <Bot size={15} className="text-[#38BDF8]" />
                <span>Language Model</span>
              </button>
            </div>

            {/* System Group */}
            <div className="space-y-0.5">
              <span className="px-2 text-[11px] font-semibold tracking-wider uppercase text-[#71717A]">
                System
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('privacy_data')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                  activeTab === 'privacy_data'
                    ? 'bg-[#27272A] text-white'
                    : 'text-[#A1A1AA] hover:bg-[#1F1F23] hover:text-white'
                }`}
              >
                <Shield size={15} />
                <span>Privacy &amp; Data</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('system')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                  activeTab === 'system'
                    ? 'bg-[#27272A] text-white'
                    : 'text-[#A1A1AA] hover:bg-[#1F1F23] hover:text-white'
                }`}
              >
                <Wrench size={15} />
                <span>System</span>
              </button>
            </div>
          </div>

          <div className="p-2 border-t border-[#27272A]/70 text-[11.5px] text-[#71717A]">
            <span>Wispr Flow v1.0.0</span>
          </div>
        </aside>

        {/* Right Main Pane */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#141416] overflow-y-auto">
          {/* Top Bar with Close Button */}
          <div className="flex items-center justify-end px-5 py-3 border-b border-[#27272A]/50 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="Close Settings"
              className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-[#27272A] cursor-pointer transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-7 space-y-6 flex-1">
            {/* TAB 1: LANGUAGE MODEL (Matches Boss's screenshot exactly!) */}
            {activeTab === 'language_model' && (
              <div className="space-y-6">
                {/* Header */}
                <div>
                  <h2 className="text-[19px] font-semibold text-white tracking-tight">
                    Language Model
                  </h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-0.5">
                    Configure models for cleanup, note formatting, and chat
                  </p>
                </div>

                {/* Subtabs matching screenshot */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setLlmSubTab('dictation_cleanup')}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors cursor-pointer ${
                      llmSubTab === 'dictation_cleanup'
                        ? 'bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/30 shadow-xs'
                        : 'text-[#A1A1AA] hover:text-white hover:bg-[#27272A]'
                    }`}
                  >
                    <Sparkles size={14} />
                    <span>Dictation Cleanup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLlmSubTab('voice_assistant')}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors cursor-pointer ${
                      llmSubTab === 'voice_assistant'
                        ? 'bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/30 shadow-xs'
                        : 'text-[#A1A1AA] hover:text-white hover:bg-[#27272A]'
                    }`}
                  >
                    <Bot size={14} />
                    <span>Voice Assistant</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLlmSubTab('translation')}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors cursor-pointer ${
                      llmSubTab === 'translation'
                        ? 'bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/30 shadow-xs'
                        : 'text-[#A1A1AA] hover:text-white hover:bg-[#27272A]'
                    }`}
                  >
                    <Languages size={14} />
                    <span>Translation</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLlmSubTab('note_formatting')}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors cursor-pointer ${
                      llmSubTab === 'note_formatting'
                        ? 'bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/30 shadow-xs'
                        : 'text-[#A1A1AA] hover:text-white hover:bg-[#27272A]'
                    }`}
                  >
                    <FileText size={14} />
                    <span>Note Formatting</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLlmSubTab('chat')}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors cursor-pointer ${
                      llmSubTab === 'chat'
                        ? 'bg-[#1E293B] text-[#38BDF8] border border-[#38BDF8]/30 shadow-xs'
                        : 'text-[#A1A1AA] hover:text-white hover:bg-[#27272A]'
                    }`}
                  >
                    <MessageSquare size={14} />
                    <span>Chat</span>
                  </button>
                </div>

                {/* Enable text cleanup Toggle Switch Card */}
                <div className="flex items-center justify-between p-4 rounded-[12px] bg-[#1B1B1E] border border-[#27272A]">
                  <div>
                    <h3 className="text-[14px] font-medium text-white">Enable text cleanup</h3>
                    <p className="text-[12.5px] text-[#A1A1AA] mt-0.5">
                      Use AI to remove filler words, fix grammar, and polish punctuation
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.enableAiCleanup}
                      onChange={(e) => updateSettings({ enableAiCleanup: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-[#27272A] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#38BDF8]" />
                  </label>
                </div>

                {/* Provider Radio Cards */}
                <div className="space-y-2.5">
                  {/* 1. OpenWhispr Cloud */}
                  <div
                    onClick={() => updateSettings({ llmProvider: 'cloud' })}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.llmProvider === 'cloud'
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/60 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#A1A1AA]">
                        <Cloud size={18} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-medium text-white">OpenWhispr Cloud</h4>
                        <p className="text-[12px] text-[#A1A1AA]">Reliable accuracy. No setup needed.</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${settings.llmProvider === 'cloud' ? 'border-[#38BDF8]' : 'border-[#52525B]'}`}>
                      {settings.llmProvider === 'cloud' && <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />}
                    </div>
                  </div>

                  {/* 2. Bring your own key */}
                  <div
                    onClick={() => updateSettings({ llmProvider: 'byok' })}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.llmProvider === 'byok'
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/60 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#A1A1AA]">
                        <Key size={18} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-medium text-white">Bring your own key</h4>
                        <p className="text-[12px] text-[#A1A1AA]">Use your own API key to connect your preferred LLM provider.</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${settings.llmProvider === 'byok' ? 'border-[#38BDF8]' : 'border-[#52525B]'}`}>
                      {settings.llmProvider === 'byok' && <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />}
                    </div>
                  </div>

                  {/* 3. Local */}
                  <div
                    onClick={() => updateSettings({ llmProvider: 'local' })}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.llmProvider === 'local'
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/60 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#A1A1AA]">
                        <Cpu size={18} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-medium text-white">Local</h4>
                        <p className="text-[12px] text-[#A1A1AA]">On-device models. Fully private.</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${settings.llmProvider === 'local' ? 'border-[#38BDF8]' : 'border-[#52525B]'}`}>
                      {settings.llmProvider === 'local' && <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />}
                    </div>
                  </div>

                  {/* 4. Self-Hosted (ACTIVE in Boss's screenshot!) */}
                  <div
                    onClick={() => updateSettings({ llmProvider: 'self_hosted' })}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.llmProvider === 'self_hosted'
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/70 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#38BDF8]">
                        <Share2 size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-[13.5px] font-semibold text-white">Self-Hosted</h4>
                          <span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-[#0284C7]/25 text-[#38BDF8] border border-[#0284C7]/40">
                            Active
                          </span>
                        </div>
                        <p className="text-[12px] text-[#A1A1AA]">Your own server on your network.</p>
                      </div>
                    </div>
                    <div className="w-4 h-4 rounded-full border border-[#38BDF8] flex items-center justify-center">
                      {settings.llmProvider === 'self_hosted' && (
                        <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                      )}
                    </div>
                  </div>

                  {/* 5. Enterprise */}
                  <div
                    onClick={() => updateSettings({ llmProvider: 'enterprise' })}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.llmProvider === 'enterprise'
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/60 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#A1A1AA]">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-medium text-white">Enterprise</h4>
                        <p className="text-[12px] text-[#A1A1AA]">Use your organization's cloud account (AWS, Azure, GCP).</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${settings.llmProvider === 'enterprise' ? 'border-[#38BDF8]' : 'border-[#52525B]'}`}>
                      {settings.llmProvider === 'enterprise' && <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />}
                    </div>
                  </div>
                </div>

                {/* Form fields for Self-Hosted (Endpoint URL & API Key) */}
                {settings.llmProvider === 'self_hosted' && (
                  <div className="space-y-4 pt-2 border-t border-[#27272A]">
                    <div>
                      <label className="block text-[13px] font-semibold text-white mb-1.5">
                        Endpoint URL
                      </label>
                      <input
                        type="url"
                        value={settings.llmEndpointUrl}
                        onChange={(e) => updateSettings({ llmEndpointUrl: e.target.value })}
                        placeholder="http://192.168.1.126:11434/v1"
                        className="w-full h-10 rounded-[8px] border border-[#27272A] bg-[#0E0E10] px-3 text-[13px] text-white focus:outline-none focus:border-[#38BDF8] transition-colors"
                      />
                      <p className="text-[11.5px] text-[#71717A] mt-1.5">
                        Point to an OpenAI-compatible server on your local network (e.g. Ollama, LM Studio, vLLM, or llama-server).
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[13px] font-semibold text-white mb-1.5">
                          API Key (Optional)
                        </label>
                        <input
                          type="password"
                          value={settings.llmApiKey || ''}
                          onChange={(e) => updateSettings({ llmApiKey: e.target.value })}
                          placeholder="Paste your API key"
                          className="w-full h-10 rounded-[8px] border border-[#27272A] bg-[#0E0E10] px-3 text-[13px] text-white focus:outline-none focus:border-[#38BDF8] transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-[13px] font-semibold text-white mb-1.5">
                          Model Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={settings.llmModel || ''}
                          onChange={(e) => updateSettings({ llmModel: e.target.value })}
                          placeholder="llama3"
                          className="w-full h-10 rounded-[8px] border border-[#27272A] bg-[#0E0E10] px-3 text-[13px] text-white focus:outline-none focus:border-[#38BDF8] transition-colors"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => handleTestConnection(settings.llmEndpointUrl, settings.llmApiKey)}
                        disabled={testingConn}
                        className="inline-flex items-center gap-2 rounded-[8px] bg-[#27272A] hover:bg-[#3F3F46] text-white px-3.5 py-2 text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {testingConn && <Loader2 size={13} className="animate-spin" />}
                        Test LLM Connection
                      </button>

                      {connStatus && (
                        <div
                          className={`flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[12px] ${
                            connStatus.ok
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {connStatus.ok ? (
                            <CheckCircle2 size={14} className="shrink-0" />
                          ) : (
                            <AlertCircle size={14} className="shrink-0" />
                          )}
                          <span>{connStatus.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SPEECH TO TEXT */}
            {activeTab === 'speech_to_text' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-[19px] font-semibold text-white tracking-tight">
                    Speech to Text
                  </h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-0.5">
                    Configure transcription engine and local ASR backend
                  </p>
                </div>

                <div className="space-y-2.5">
                  {/* Option 1: Wispr Flow Private Server */}
                  <div
                    onClick={() => {
                      updateSettings({ sttProvider: 'flow_server', serverUrl: 'http://localhost:8000', mockMode: false });
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.sttProvider === 'flow_server' && !settings.mockMode
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/70 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#38BDF8]">
                        <Server size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-[13.5px] font-semibold text-white">Wispr Flow Private Server</h4>
                          <span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-[#0284C7]/25 text-[#38BDF8] border border-[#0284C7]/40">
                            Local Faster-Whisper
                          </span>
                        </div>
                        <p className="text-[12px] text-[#A1A1AA]">High-performance local ASR server on http://localhost:8000</p>
                      </div>
                    </div>
                    <div className="w-4 h-4 rounded-full border border-[#38BDF8] flex items-center justify-center">
                      {settings.sttProvider === 'flow_server' && !settings.mockMode && (
                        <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />
                      )}
                    </div>
                  </div>

                  {/* Option 2: Self-Hosted / OpenAI Compatible */}
                  <div
                    onClick={() => {
                      updateSettings({ sttProvider: 'self_hosted', mockMode: false });
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.sttProvider === 'self_hosted' && !settings.mockMode
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/70 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#A1A1AA]">
                        <Share2 size={18} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-medium text-white">Self-Hosted / OpenAI Compatible</h4>
                        <p className="text-[12px] text-[#A1A1AA]">Custom Whisper endpoint supporting /v1/audio/transcriptions</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${settings.sttProvider === 'self_hosted' && !settings.mockMode ? 'border-[#38BDF8]' : 'border-[#52525B]'}`}>
                      {settings.sttProvider === 'self_hosted' && !settings.mockMode && <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />}
                    </div>
                  </div>

                  {/* Option 3: Mock Mode */}
                  <div
                    onClick={() => {
                      updateSettings({ mockMode: true, sttProvider: 'mock' });
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-[12px] border cursor-pointer transition-all ${
                      settings.mockMode
                        ? 'bg-[#1B1B1E] border-[#38BDF8]/70 shadow-xs'
                        : 'bg-[#18181B] border-[#27272A] hover:border-[#3F3F46]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-[#27272A] flex items-center justify-center text-[#A1A1AA]">
                        <Cpu size={18} />
                      </div>
                      <div>
                        <h4 className="text-[13.5px] font-medium text-white">Mock Mode (Offline Test)</h4>
                        <p className="text-[12px] text-[#A1A1AA]">Instant simulated transcription for UI &amp; hotkey verification</p>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${settings.mockMode ? 'border-[#38BDF8]' : 'border-[#52525B]'}`}>
                      {settings.mockMode && <div className="w-2 h-2 rounded-full bg-[#38BDF8]" />}
                    </div>
                  </div>
                </div>

                {/* Endpoint Settings */}
                <div className="space-y-4 pt-2 border-t border-[#27272A]">
                  <div>
                    <label className="block text-[13px] font-semibold text-white mb-1.5">
                      Server Endpoint URL
                    </label>
                    <input
                      type="url"
                      value={settings.sttProvider === 'self_hosted' ? settings.sttEndpointUrl : settings.serverUrl}
                      onChange={(e) => {
                        if (settings.sttProvider === 'self_hosted') {
                          updateSettings({ sttEndpointUrl: e.target.value });
                        } else {
                          updateSettings({ serverUrl: e.target.value });
                        }
                      }}
                      placeholder="http://localhost:8000"
                      className="w-full h-10 rounded-[8px] border border-[#27272A] bg-[#0E0E10] px-3 text-[13px] text-white focus:outline-none focus:border-[#38BDF8] transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-semibold text-white mb-1.5">
                      API Key (Optional)
                    </label>
                    <input
                      type="password"
                      value={settings.sttProvider === 'self_hosted' ? (settings.sttApiKey || '') : settings.apiKey}
                      onChange={(e) => {
                        if (settings.sttProvider === 'self_hosted') {
                          updateSettings({ sttApiKey: e.target.value });
                        } else {
                          updateSettings({ apiKey: e.target.value });
                        }
                      }}
                      placeholder="Bearer API key"
                      className="w-full h-10 rounded-[8px] border border-[#27272A] bg-[#0E0E10] px-3 text-[13px] text-white focus:outline-none focus:border-[#38BDF8] transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleTestConnection(
                          settings.sttProvider === 'self_hosted' ? settings.sttEndpointUrl : settings.serverUrl,
                          settings.sttProvider === 'self_hosted' ? settings.sttApiKey : settings.apiKey
                        )
                      }
                      disabled={testingConn}
                      className="inline-flex items-center gap-2 rounded-[8px] bg-[#27272A] hover:bg-[#3F3F46] text-white px-3.5 py-2 text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {testingConn && <Loader2 size={13} className="animate-spin" />}
                      Test ASR Connection
                    </button>

                    {connStatus && (
                      <div
                        className={`flex items-center gap-2 rounded-[8px] px-3 py-1.5 text-[12px] ${
                          connStatus.ok
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {connStatus.ok ? (
                          <CheckCircle2 size={14} className="shrink-0" />
                        ) : (
                          <AlertCircle size={14} className="shrink-0" />
                        )}
                        <span>{connStatus.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: HOTKEYS */}
            {activeTab === 'hotkeys' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-[19px] font-semibold text-white tracking-tight">
                    Hotkeys &amp; Audio Input
                  </h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-0.5">
                    Customize global keystrokes and microphone hardware
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Push to talk hotkey */}
                  <div className="p-4 rounded-[12px] bg-[#18181B] border border-[#27272A] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-white">Push-to-talk</span>
                      {!pttIsDefault && (
                        <button
                          type="button"
                          onClick={() => updateSettings({ pushToTalkHotkey: DEFAULT_PTT_HOTKEY })}
                          className="inline-flex items-center gap-1 text-[11px] text-[#71717A] hover:text-white"
                        >
                          <RotateCcw size={11} /> Reset
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCapturingTarget(capturingTarget === 'push_to_talk' ? null : 'push_to_talk')
                      }
                      className={`w-full h-10 flex items-center justify-between px-3 rounded-[8px] border text-[13px] transition-colors ${
                        capturingTarget === 'push_to_talk'
                          ? 'border-[#38BDF8] bg-[#0284C7]/20 text-[#38BDF8]'
                          : 'border-[#27272A] bg-[#0E0E10] text-white hover:border-[#52525B]'
                      }`}
                    >
                      <span className="font-medium">
                        {capturingTarget === 'push_to_talk' ? 'Press key…' : settings.pushToTalkHotkey.label}
                      </span>
                      <span className="text-[11px] opacity-70">
                        {capturingTarget === 'push_to_talk' ? 'Esc' : 'Change'}
                      </span>
                    </button>
                    <p className="text-[11.5px] text-[#71717A]">Hold to speak, release to insert text</p>
                  </div>

                  {/* Hands free hotkey */}
                  <div className="p-4 rounded-[12px] bg-[#18181B] border border-[#27272A] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-white">Hands-free</span>
                      {!handsFreeIsDefault && (
                        <button
                          type="button"
                          onClick={() => updateSettings({ handsFreeHotkey: DEFAULT_HANDS_FREE_HOTKEY })}
                          className="inline-flex items-center gap-1 text-[11px] text-[#71717A] hover:text-white"
                        >
                          <RotateCcw size={11} /> Reset
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setCapturingTarget(capturingTarget === 'hands_free' ? null : 'hands_free')
                      }
                      className={`w-full h-10 flex items-center justify-between px-3 rounded-[8px] border text-[13px] transition-colors ${
                        capturingTarget === 'hands_free'
                          ? 'border-[#38BDF8] bg-[#0284C7]/20 text-[#38BDF8]'
                          : 'border-[#27272A] bg-[#0E0E10] text-white hover:border-[#52525B]'
                      }`}
                    >
                      <span className="font-medium">
                        {capturingTarget === 'hands_free' ? 'Press key…' : settings.handsFreeHotkey.label}
                      </span>
                      <span className="text-[11px] opacity-70">
                        {capturingTarget === 'hands_free' ? 'Esc' : 'Change'}
                      </span>
                    </button>
                    <p className="text-[11.5px] text-[#71717A]">Press once to start, again or click ✓ to commit</p>
                  </div>
                </div>

                {/* Microphone Selection */}
                <div className="space-y-3 pt-2 border-t border-[#27272A]">
                  <div>
                    <label className="block text-[13px] font-semibold text-white mb-1.5">
                      Microphone Input Device
                    </label>
                    <select
                      value={settings.micDeviceId}
                      onChange={(e) => updateSettings({ micDeviceId: e.target.value })}
                      className="w-full h-10 rounded-[8px] border border-[#27272A] bg-[#0E0E10] px-3 text-[13px] text-white focus:outline-none focus:border-[#38BDF8]"
                    >
                      {mics.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[13px] font-semibold text-white mb-1.5">
                      Silence Auto-Stop (Hands-free)
                    </label>
                    <select
                      value={settings.silenceTimeoutSec}
                      onChange={(e) => updateSettings({ silenceTimeoutSec: Number(e.target.value) })}
                      className="w-full h-10 rounded-[8px] border border-[#27272A] bg-[#0E0E10] px-3 text-[13px] text-white focus:outline-none focus:border-[#38BDF8]"
                    >
                      <option value={0}>Disabled (continuous recording until stopped)</option>
                      <option value={3}>3 seconds of silence</option>
                      <option value={5}>5 seconds of silence</option>
                      <option value={15}>15 seconds</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: PRIVACY, DATA & SYSTEM */}
            {(activeTab === 'privacy_data' || activeTab === 'system' || activeTab === 'preferences' || activeTab === 'tone_style') && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-[19px] font-semibold text-white tracking-tight">
                    Preferences &amp; Data
                  </h2>
                  <p className="text-[13px] text-[#A1A1AA] mt-0.5">
                    Manage local storage, theme, and privacy settings
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-[12px] bg-[#18181B] border border-[#27272A]">
                  <div>
                    <h4 className="text-[13.5px] font-medium text-white">Appearance</h4>
                    <p className="text-[12px] text-[#A1A1AA]">Switch between light and dark themes</p>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 rounded-[8px] bg-[#27272A]">
                    <button
                      type="button"
                      onClick={() => updateSettings({ theme: 'light' })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-[12px] font-medium transition-colors ${
                        settings.theme === 'light' ? 'bg-[#3F3F46] text-white' : 'text-[#A1A1AA]'
                      }`}
                    >
                      <Sun size={13} /> Light
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ theme: 'dark' })}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[6px] text-[12px] font-medium transition-colors ${
                        settings.theme === 'dark' ? 'bg-[#3F3F46] text-white' : 'text-[#A1A1AA]'
                      }`}
                    >
                      <Moon size={13} /> Dark
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-[12px] bg-[#18181B] border border-[#27272A]">
                  <div>
                    <h4 className="text-[13.5px] font-medium text-white">Clear Dictation History</h4>
                    <p className="text-[12px] text-[#A1A1AA]">
                      {historyCount} audio recordings and transcripts stored locally
                    </p>
                  </div>
                  {!confirmClear ? (
                    <button
                      type="button"
                      disabled={historyCount === 0}
                      onClick={() => setConfirmClear(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-red-500/40 text-[12.5px] font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={13} /> Clear History
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void clearHistory();
                          setConfirmClear(false);
                        }}
                        className="px-3 py-1.5 rounded-[8px] bg-red-600 hover:bg-red-700 text-white text-[12px] font-medium"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="px-2.5 py-1.5 rounded-[8px] border border-[#3F3F46] text-[#A1A1AA] text-[12px]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 rounded-[12px] bg-[#18181B] border border-[#27272A]">
                  <div>
                    <h4 className="text-[13.5px] font-medium text-white">Reset All State</h4>
                    <p className="text-[12px] text-[#A1A1AA]">
                      Restore all settings, endpoints, dictionary and style presets to defaults
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void resetAllState();
                      setConfirmClear(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[#3F3F46] text-[12.5px] font-medium text-[#A1A1AA] hover:text-white transition-colors"
                  >
                    <RotateCcw size={13} /> Reset All
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
