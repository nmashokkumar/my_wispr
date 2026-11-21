import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Flag,
  Mic,
  MoreVertical,
  Play,
  RefreshCw,
  Search,
  Square,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { platform } from '../services/platform';
import {
  computeInsights,
  formatTimeShort,
  groupHistoryByDate,
} from '../utils/textPipeline';
import type { HistoryEntry, StyleContext } from '../types';

const APP_TAGS = ['Slack', 'Gmail', 'VS Code', 'Notion', 'WhatsApp', 'Linear', 'Notes'];
const CONTEXT_OPTIONS: Array<{ value: StyleContext; label: string }> = [
  { value: 'work', label: 'Work' },
  { value: 'personal', label: 'Personal' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

export function DictationPage() {
  const history = useFlowStore((s) => s.history);
  const settings = useFlowStore((s) => s.settings);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const dismissed = useFlowStore((s) => s.dismissed);
  const dismissBanner = useFlowStore((s) => s.dismissBanner);
  const setSettingsOpen = useFlowStore((s) => s.setSettingsOpen);
  const overlayState = useFlowStore((s) => s.overlayState);
  const startDictation = useFlowStore((s) => s.startDictation);
  const stopDictation = useFlowStore((s) => s.stopDictation);
  const lastResult = useFlowStore((s) => s.lastResult);
  const testInputText = useFlowStore((s) => s.testInputText);
  const setTestInputText = useFlowStore((s) => s.setTestInputText);
  const appendTestInputText = useFlowStore((s) => s.appendTestInputText);
  const toggleFlagHistory = useFlowStore((s) => s.toggleFlagHistory);
  const updateHistoryAppTag = useFlowStore((s) => s.updateHistoryAppTag);
  const deleteHistory = useFlowStore((s) => s.deleteHistory);
  const retranscribeHistory = useFlowStore((s) => s.retranscribeHistory);
  const pushToast = useFlowStore((s) => s.pushToast);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showTipsModal, setShowTipsModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Register this page's test input as the sink for platform.insertText(text)
  useEffect(() => {
    platform.registerTestInputSink((text) => {
      appendTestInputText(text);
    });
    return () => {
      platform.registerTestInputSink(null);
    };
  }, [appendTestInputText]);

  // Close row dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openMenuId]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stats = useMemo(() => computeInsights(history, 7), [history]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (item) =>
        item.text.toLowerCase().includes(q) ||
        item.rawText.toLowerCase().includes(q) ||
        item.appTag.toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

  const groups = useMemo(() => groupHistoryByDate(filteredHistory), [filteredHistory]);

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingId(null);
  };

  const handlePlayEntry = (entry: HistoryEntry) => {
    if (playingId === entry.id) {
      stopPlayback();
      return;
    }
    stopPlayback();

    if (entry.audioBlob && entry.audioBlob.size > 32) {
      const url = URL.createObjectURL(entry.audioBlob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingId(entry.id);
      audio.onended = () => stopPlayback();
      audio.onerror = () => {
        stopPlayback();
        pushToast('Unable to decode recorded audio blob', 'error');
      };
      void audio.play().catch(() => {
        stopPlayback();
        pushToast('Audio playback blocked by browser', 'error');
      });
      return;
    }

    // Fallback for seeded entries without a mic recording: use Web Speech preview if available
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(entry.text);
      utter.rate = 1.05;
      utter.onend = () => setPlayingId(null);
      utter.onerror = () => setPlayingId(null);
      setPlayingId(entry.id);
      window.speechSynthesis.speak(utter);
    } else {
      pushToast('No audio recording stored for this sample entry');
    }
  };

  const handleCopyEntry = async (entry: HistoryEntry) => {
    await platform.copyToClipboard(entry.text);
    setCopiedId(entry.id);
    pushToast('Copied transcript to clipboard');
    setTimeout(() => setCopiedId((prev) => (prev === entry.id ? null : prev)), 1500);
  };

  return (
    <div className="max-w-[1060px] mx-auto w-full px-6 md:px-10 pt-8 pb-24">
      <div className="flex flex-col lg:flex-row gap-7 items-start">
        {/* Main left column */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Greeting header matching Screenshot 4 */}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] md:text-[28px] font-semibold tracking-[-0.02em] text-[var(--flow-text)] leading-tight flex flex-wrap items-center gap-2.5">
              <span>Hey, get back into the flow with</span>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                title={`Push-to-talk: ${settings.pushToTalkHotkey.label} · Hands-free: ${settings.handsFreeHotkey.label} (click to customize)`}
                className="inline-flex items-center justify-center rounded-[9px] bg-[var(--flow-keycap-bg)] text-[var(--flow-keycap-text)] border-[1.5px] border-[var(--flow-keycap-border)] px-2.5 py-0.5 text-[16px] font-semibold leading-snug shadow-[0_2px_0_var(--flow-keycap-border)] hover:brightness-105 active:translate-y-[1px] transition-all cursor-pointer"
              >
                {settings.dictationMode === 'push_to_talk'
                  ? settings.pushToTalkHotkey.label
                  : settings.handsFreeHotkey.label}
              </button>
            </h1>
          </div>

          {/* Dismissible tips banner matching Screenshot 4 */}
          {!dismissed.dictationTips && (
            <section
              aria-label="Dictation tips"
              className="banner-dictation relative overflow-hidden rounded-[18px] px-7 py-6 text-white shadow-xs"
            >
              <button
                type="button"
                onClick={() => dismissBanner('dictationTips')}
                aria-label="Dismiss tips banner"
                className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white/85 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>

              <h2 className="font-serif-display text-[24px] md:text-[26px] font-normal tracking-[-0.01em] text-white leading-snug pr-8">
                Working around other people?
              </h2>
              <p className="mt-1.5 text-[13.5px] text-white/85 max-w-[480px] leading-relaxed">
                With the right setup, you can Flow without disrupting your neighbors
              </p>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowTipsModal(true)}
                  className="rounded-[10px] bg-[#F4F3EE] hover:bg-white text-[#1C1C1C] px-4 py-2 text-[13.5px] font-medium transition-colors cursor-pointer"
                >
                  Show me how
                </button>
              </div>
            </section>
          )}

          {/* Browser test input area for platform.insertText(text) */}
          <section
            aria-label="Dictation test pad"
            className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--flow-border-subtle)] bg-[var(--flow-surface-muted)]/60">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-medium text-[var(--flow-text-secondary)]">
                  Test input
                </span>
                <span className="text-[var(--flow-text-muted)]" aria-hidden="true">
                  ·
                </span>
                <label className="sr-only" htmlFor="active-context-select">
                  Dictation context
                </label>
                <select
                  id="active-context-select"
                  value={settings.activeContext}
                  onChange={(e) => updateSettings({ activeContext: e.target.value as StyleContext })}
                  className="text-[12px] font-medium bg-transparent text-[var(--flow-text)] cursor-pointer focus:outline-none"
                >
                  {CONTEXT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[var(--flow-surface)] text-[var(--flow-text)]">
                      {opt.label} style
                    </option>
                  ))}
                </select>
                <span className="text-[var(--flow-text-muted)]" aria-hidden="true">
                  ·
                </span>
                <label className="sr-only" htmlFor="active-app-select">
                  Active app tag
                </label>
                <select
                  id="active-app-select"
                  value={settings.activeAppTag}
                  onChange={(e) => updateSettings({ activeAppTag: e.target.value })}
                  className="text-[12px] text-[var(--flow-text-secondary)] bg-transparent cursor-pointer focus:outline-none"
                >
                  {APP_TAGS.map((app) => (
                    <option key={app} value={app} className="bg-[var(--flow-surface)] text-[var(--flow-text)]">
                      {app}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                {testInputText && (
                  <button
                    type="button"
                    onClick={() => setTestInputText('')}
                    className="text-[12px] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] px-2 py-1 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    overlayState === 'listening' ? void stopDictation() : void startDictation()
                  }
                  disabled={overlayState === 'transcribing'}
                  className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                    overlayState === 'listening'
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-[var(--flow-primary-btn)] hover:bg-[var(--flow-primary-btn-hover)] text-[var(--flow-primary-btn-text)]'
                  }`}
                >
                  {overlayState === 'listening' ? (
                    <>
                      <Square size={12} fill="currentColor" />
                      Stop &amp; transcribe
                    </>
                  ) : (
                    <>
                      <Mic size={13} />
                      {overlayState === 'transcribing' ? 'Transcribing…' : 'Dictate'}
                    </>
                  )}
                </button>
              </div>
            </div>

            <textarea
              id="flow-test-input"
              aria-label="Dictation test input"
              value={testInputText}
              onChange={(e) => setTestInputText(e.target.value)}
              rows={2}
              placeholder={`Hold ${settings.pushToTalkHotkey.label} (push-to-talk) or press ${settings.handsFreeHotkey.label} (hands-free) — polished text inserts here…`}
              className="w-full resize-none bg-transparent px-4 py-3 text-[14.5px] leading-relaxed text-[var(--flow-text)] placeholder:text-[var(--flow-text-muted)] focus:outline-none"
            />

            {lastResult && (lastResult.fillerRemovedCount > 0 || lastResult.correctionsAppliedCount > 0) && (
              <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-0.5">
                {lastResult.fillerRemovedCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-[var(--flow-chip-filler-bg)] text-[var(--flow-chip-filler-text)] px-2.5 py-0.5 text-[11.5px] font-medium">
                    Filler removed
                  </span>
                )}
                {lastResult.correctionsAppliedCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-[var(--flow-chip-correction-bg)] text-[var(--flow-chip-correction-text)] px-2.5 py-0.5 text-[11.5px] font-medium">
                    Correction applied
                  </span>
                )}
              </div>
            )}
          </section>

          {/* History list grouped by TODAY / YESTERDAY / date */}
          <section aria-label="Dictation history" className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-[var(--flow-text-muted)]">
                {groups.length > 0 ? groups[0].label : 'HISTORY'}
              </h2>

              <div className="flex items-center gap-2">
                {searchOpen && (
                  <div className="relative flex items-center">
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter transcripts…"
                      aria-label="Search dictation history"
                      autoFocus
                      className="w-[210px] rounded-[9px] border border-[var(--flow-border)] bg-[var(--flow-surface)] pl-3 pr-7 py-1 text-[13px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear history search"
                        className="absolute right-2 text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (searchOpen) setSearchQuery('');
                    setSearchOpen(!searchOpen);
                  }}
                  aria-label="Search history"
                  title="Search history"
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    searchOpen
                      ? 'bg-[var(--flow-nav-active)] text-[var(--flow-text)]'
                      : 'text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)]'
                  }`}
                >
                  <Search size={16} />
                </button>
              </div>
            </div>

            {groups.length === 0 ? (
              <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] px-6 py-12 text-center">
                <p className="text-[15px] font-medium text-[var(--flow-text)]">
                  {searchQuery ? 'No matching dictations' : 'No dictations yet'}
                </p>
                <p className="mt-1 text-[13.5px] text-[var(--flow-text-muted)]">
                  {searchQuery
                    ? 'Try a different keyword or clear the search filter.'
                    : `Hold ${settings.pushToTalkHotkey.label}, press ${settings.handsFreeHotkey.label}, or click Dictate to record your first note.`}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group, groupIdx) => (
                  <div key={group.key} className="space-y-2.5">
                    {groupIdx > 0 && (
                      <h3 className="text-[11.5px] font-semibold tracking-[0.06em] uppercase text-[var(--flow-text-muted)]">
                        {group.label}
                      </h3>
                    )}

                    <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] divide-y divide-[var(--flow-border-subtle)]">
                      {group.entries.map((entry) => {
                        const isPlaying = playingId === entry.id;
                        const isExpanded = expandedDiffId === entry.id;
                        const menuOpen = openMenuId === entry.id;

                        return (
                          <div
                            key={entry.id}
                            className="group relative flex items-start gap-4 px-5 py-4 hover:bg-[var(--flow-surface-hover)] transition-colors first:rounded-t-[18px] last:rounded-b-[18px]"
                          >
                            {/* Timestamp column */}
                            <div className="w-[64px] shrink-0 pt-0.5 text-[12.5px] text-[var(--flow-text-muted)] tabular-nums">
                              {formatTimeShort(entry.timestamp)}
                            </div>

                            {/* Transcript body */}
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="text-[14.5px] leading-[1.6] text-[var(--flow-text)] whitespace-pre-wrap break-words">
                                {entry.text}
                              </p>

                              {isExpanded && (
                                <div className="mt-3 rounded-[12px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border-subtle)] p-3 text-[12.5px] space-y-1.5">
                                  <div className="flex items-center justify-between text-[var(--flow-text-muted)]">
                                    <span className="font-medium">Raw speech transcript</span>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedDiffId(null)}
                                      className="hover:text-[var(--flow-text)] cursor-pointer"
                                    >
                                      Hide
                                    </button>
                                  </div>
                                  <p className="text-[var(--flow-text-secondary)] italic">
                                    “{entry.rawText || entry.text}”
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11.5px] text-[var(--flow-text-muted)]">
                                    <span>Style: {entry.styleUsed.replace('_', ' ')}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>App: {entry.appTag}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums">
                                      {(entry.durationMs / 1000).toFixed(1)}s
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Hover actions matching Screenshot 4 */}
                            <div
                              className={`flex items-center gap-0.5 shrink-0 pt-0.5 transition-opacity duration-150 ${
                                entry.flagged || menuOpen || isPlaying
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => handlePlayEntry(entry)}
                                aria-label={isPlaying ? 'Stop audio playback' : 'Play audio'}
                                title={isPlaying ? 'Stop playback' : 'Play audio'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  isPlaying
                                    ? 'text-[var(--flow-accent)] bg-[var(--flow-accent-soft)]'
                                    : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)]'
                                }`}
                              >
                                {isPlaying ? <Square size={14} fill="currentColor" /> : <Play size={14} />}
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleCopyEntry(entry)}
                                aria-label="Copy transcript"
                                title="Copy transcript"
                                className="p-1.5 rounded-lg text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)] transition-colors cursor-pointer"
                              >
                                {copiedId === entry.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                              </button>

                              <button
                                type="button"
                                onClick={() => void toggleFlagHistory(entry.id)}
                                aria-label={entry.flagged ? 'Unflag transcript' : 'Flag transcript'}
                                title={entry.flagged ? 'Unflag' : 'Flag'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  entry.flagged
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)]'
                                }`}
                              >
                                <Flag size={14} fill={entry.flagged ? 'currentColor' : 'none'} />
                              </button>

                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(menuOpen ? null : entry.id);
                                  }}
                                  aria-label="More actions"
                                  aria-expanded={menuOpen}
                                  className="p-1.5 rounded-lg text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)] transition-colors cursor-pointer"
                                >
                                  <MoreVertical size={14} />
                                </button>

                                {menuOpen && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 mt-1 w-48 rounded-[12px] bg-[var(--flow-surface)] border border-[var(--flow-border)] shadow-xl py-1.5 z-30 text-[13px]"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        void retranscribeHistory(entry.id);
                                      }}
                                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
                                    >
                                      <RefreshCw size={13.5} />
                                      Re-transcribe
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        setExpandedDiffId(isExpanded ? null : entry.id);
                                      }}
                                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
                                    >
                                      <Tag size={13.5} />
                                      {isExpanded ? 'Hide raw speech' : 'View raw speech'}
                                    </button>
                                    <div className="px-3.5 py-1.5 border-t border-[var(--flow-border-subtle)] mt-1">
                                      <span className="block text-[11px] text-[var(--flow-text-muted)] mb-1">
                                        Tag app
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {APP_TAGS.slice(0, 5).map((app) => (
                                          <button
                                            key={app}
                                            type="button"
                                            onClick={() => {
                                              setOpenMenuId(null);
                                              void updateHistoryAppTag(entry.id, app);
                                            }}
                                            className={`px-1.5 py-0.5 rounded text-[11px] cursor-pointer ${
                                              entry.appTag === app
                                                ? 'bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] font-medium'
                                                : 'bg-[var(--flow-surface-muted)] text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
                                            }`}
                                          >
                                            {app}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        void deleteHistory(entry.id);
                                      }}
                                      className="flex items-center gap-2.5 w-full px-3.5 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer border-t border-[var(--flow-border-subtle)] mt-1"
                                    >
                                      <Trash2 size={13.5} />
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right stats card matching Screenshot 4 (total words, avg WPM, day streak ONLY) */}
        <aside className="w-full lg:w-[244px] shrink-0 lg:mt-[54px]">
          <div className="rounded-[18px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)] px-6 py-6 space-y-5">
            <div className="flex items-baseline gap-2.5">
              <span className="font-serif-display text-[32px] leading-none text-[var(--flow-text)] tabular-nums">
                {stats.totalWords.toLocaleString()}
              </span>
              <span className="text-[14px] text-[var(--flow-text-secondary)]">total words</span>
            </div>

            <div className="flex items-baseline gap-2.5">
              <span className="font-serif-display text-[32px] leading-none text-[var(--flow-text)] tabular-nums">
                {stats.avgWpm}
              </span>
              <span className="text-[14px] text-[var(--flow-text-secondary)]">wpm</span>
            </div>

            <div className="flex items-baseline gap-2.5">
              <span className="font-serif-display text-[32px] leading-none text-[var(--flow-text)] tabular-nums">
                {stats.dayStreak}
              </span>
              <span className="text-[14px] text-[var(--flow-text-secondary)]">
                {stats.dayStreak === 1 ? 'day streak' : 'days streak'}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {/* Tips modal triggered by "Show me how" */}
      {showTipsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tips-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTipsModal(false);
          }}
        >
          <div className="w-full max-w-[460px] rounded-[20px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="tips-modal-title" className="font-serif-display text-[22px] text-[var(--flow-text)]">
                Dictate quietly anywhere
              </h2>
              <button
                type="button"
                onClick={() => setShowTipsModal(false)}
                aria-label="Close tips"
                className="p-1.5 rounded-lg text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>
            <ul className="space-y-3 text-[13.5px] leading-relaxed text-[var(--flow-text-secondary)]">
              <li>
                <strong className="text-[var(--flow-text)]">1. Speak softly in Push-to-talk:</strong> Hold{' '}
                <kbd className="rounded bg-[var(--flow-surface-muted)] border border-[var(--flow-border)] px-1.5 py-0.5 text-[12px] text-[var(--flow-text)]">
                  {settings.pushToTalkHotkey.label}
                </kbd>{' '}
                only while speaking so ambient keyboard noise never enters the stream.
              </li>
              <li>
                <strong className="text-[var(--flow-text)]">2. Use Hands-free with auto-stop:</strong> Press{' '}
                <kbd className="rounded bg-[var(--flow-surface-muted)] border border-[var(--flow-border)] px-1.5 py-0.5 text-[12px] text-[var(--flow-text)]">
                  {settings.handsFreeHotkey.label}
                </kbd>{' '}
                for longer emails. Flow stops automatically after {settings.silenceTimeoutSec || 3}s of silence.
              </li>
              <li>
                <strong className="text-[var(--flow-text)]">3. Choose a close-field mic:</strong> Pick your headset or
                USB mic in Settings for crisp near-field transcription.
              </li>
            </ul>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowTipsModal(false);
                  setSettingsOpen(true);
                }}
                className="rounded-[10px] border border-[var(--flow-border)] px-3.5 py-2 text-[13px] font-medium text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
              >
                Open mic settings
              </button>
              <button
                type="button"
                onClick={() => setShowTipsModal(false)}
                className="rounded-[10px] bg-[var(--flow-primary-btn)] text-[var(--flow-primary-btn-text)] px-4 py-2 text-[13px] font-medium cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
