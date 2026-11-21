import { useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Hash,
  Inbox,
  Mail,
  MessageCircle,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { applyLocalCleanupPipeline } from '../utils/textPipeline';
import type { AutoCleanupConfig, StyleContext, StylePreset, StyleTab } from '../types';

const STYLE_TABS: Array<{ id: StyleTab; label: string; beta?: boolean }> = [
  { id: 'personal', label: 'Personal messages' },
  { id: 'work', label: 'Work messages' },
  { id: 'email', label: 'Email' },
  { id: 'other', label: 'Other' },
  { id: 'auto_cleanup', label: 'Auto cleanup', beta: true },
];

const CONTEXT_BANNERS: Record<
  StyleContext,
  {
    headline: string;
    description: string;
    icons: Array<{ bg: string; icon: typeof MessageCircle; label: string }>;
    examples: Record<StylePreset, string>;
  }
> = {
  personal: {
    headline: 'This style applies in personal messengers',
    description: 'Choose how Flow formats punctuation and casing across your everyday chat apps.',
    icons: [
      { bg: '#25D366', icon: MessageCircle, label: 'WhatsApp' },
      { bg: '#2AABEE', icon: Send, label: 'Telegram' },
      { bg: '#5865F2', icon: MessageSquare, label: 'Discord' },
      { bg: '#E1306C', icon: Sparkles, label: 'Instagram' },
    ],
    examples: {
      formal: "Hey, are you free for lunch tomorrow? Let's do 12 if that works for you.",
      casual: "Hey are you free for lunch tomorrow? Let's do 12 if that works for you",
      very_casual: "hey are you free for lunch tomorrow? let's do 12 if that works for you",
    },
  },
  work: {
    headline: 'This style applies in work messengers',
    description: 'Keep team updates clear and consistent in Slack, Teams, and project trackers.',
    icons: [
      { bg: '#4A154B', icon: Hash, label: 'Slack' },
      { bg: '#5B5FC7', icon: MessageSquare, label: 'Teams' },
      { bg: '#1F2937', icon: Code2, label: 'Linear' },
      { bg: '#0EA5E9', icon: Terminal, label: 'Mattermost' },
    ],
    examples: {
      formal: 'Hi team, I pushed the latest Wayland patch. Can someone review it before 4 pm?',
      casual: 'Hi team I pushed the latest Wayland patch. Can someone review it before 4 pm?',
      very_casual: 'hi team i pushed the latest Wayland patch. can someone review it before 4 pm?',
    },
  },
  email: {
    headline: 'This style applies in email clients',
    description: 'Polish greetings, sentences, and sign-offs automatically when dictating email.',
    icons: [
      { bg: '#EA4335', icon: Mail, label: 'Gmail' },
      { bg: '#0078D4', icon: Inbox, label: 'Outlook' },
      { bg: '#2563EB', icon: Send, label: 'Thunderbird' },
    ],
    examples: {
      formal: 'Hi Sarah, thanks for sending over the Q4 numbers. Let me know if Friday works to review.',
      casual: 'Hi Sarah thanks for sending over the Q4 numbers. Let me know if Friday works to review',
      very_casual: 'hi sarah thanks for sending over the Q4 numbers. let me know if friday works to review',
    },
  },
  other: {
    headline: 'This style applies in all other apps',
    description: 'Default formatting applied to notes, documents, browsers, and code editors.',
    icons: [
      { bg: '#1F2937', icon: Terminal, label: 'Terminal' },
      { bg: '#007ACC', icon: Code2, label: 'VS Code' },
      { bg: '#374151', icon: MessageSquare, label: 'Notes' },
    ],
    examples: {
      formal: 'The meeting has moved to 3 pm tomorrow. Can everyone bring their slides?',
      casual: 'The meeting has moved to 3 pm tomorrow. Can everyone bring their slides',
      very_casual: 'the meeting has moved to 3 pm tomorrow. can everyone bring their slides',
    },
  },
};

const PRESET_CARDS: Array<{
  id: StylePreset;
  title: string;
  subtitle: string;
  avatarBg: string;
  avatarText: string;
}> = [
  {
    id: 'formal',
    title: 'Formal.',
    subtitle: 'Caps + Punctuation',
    avatarBg: '#E5CCF5',
    avatarText: '#FFFFFF',
  },
  {
    id: 'casual',
    title: 'Casual',
    subtitle: 'Caps + Less punctuation',
    avatarBg: '#F7A8E8',
    avatarText: '#FFFFFF',
  },
  {
    id: 'very_casual',
    title: 'very casual',
    subtitle: 'No Caps + Less punctuation',
    avatarBg: '#5E122B',
    avatarText: '#FFFFFF',
  },
];

const CLEANUP_TOGGLES: Array<{
  key: keyof AutoCleanupConfig;
  title: string;
  description: string;
}> = [
  {
    key: 'removeFillerWords',
    title: 'Remove filler words',
    description: 'Strips spoken hesitations like “um”, “uh”, “er”, “you know”, and leading “um so”.',
  },
  {
    key: 'applySelfCorrections',
    title: 'Apply self-corrections',
    description: 'Resolves mid-sentence changes like “Thursday, actually no Friday” → “Friday” and stutters.',
  },
  {
    key: 'autoPunctuation',
    title: 'Auto punctuation',
    description: 'Adds natural sentence boundaries, periods, and question marks.',
  },
  {
    key: 'autoCapitalization',
    title: 'Auto capitalization',
    description: 'Capitalizes sentence starts and standalone “I” (respects Very casual mode).',
  },
];

const DEFAULT_DEMO_RAW =
  'um so can you send the the report to Sarah by uh Thursday actually no Friday and let her know its nearly done';

function renderVeryCasualHighlighted(text: string) {
  // Highlight lowercase sentence starters in Flow purple (#7C4DDB) exactly like Screenshot 1
  const parts = text.split(/([.!?]\s+)/);
  return parts.map((segment, idx) => {
    if (idx % 2 === 1 || !segment) return <span key={idx}>{segment}</span>;
    const first = segment.charAt(0);
    const rest = segment.slice(1);
    return (
      <span key={idx}>
        <span className="text-[var(--flow-accent)] font-medium">{first}</span>
        {rest}
      </span>
    );
  });
}

export function StylePage() {
  const stylesByContext = useFlowStore((s) => s.stylesByContext);
  const setStylePreset = useFlowStore((s) => s.setStylePreset);
  const cleanupConfig = useFlowStore((s) => s.cleanupConfig);
  const updateCleanupConfig = useFlowStore((s) => s.updateCleanupConfig);
  const dictionary = useFlowStore((s) => s.dictionary);
  const updateSettings = useFlowStore((s) => s.updateSettings);
  const pushToast = useFlowStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<StyleTab>('personal');
  const [demoRaw, setDemoRaw] = useState(DEFAULT_DEMO_RAW);

  const liveCleanupPreview = useMemo(
    () =>
      applyLocalCleanupPipeline(demoRaw, {
        style: 'formal',
        context: 'work',
        cleanup: cleanupConfig,
        dictionary,
      }),
    [demoRaw, cleanupConfig, dictionary]
  );

  const isContextTab = activeTab !== 'auto_cleanup';
  const contextMeta = isContextTab ? CONTEXT_BANNERS[activeTab] : null;
  const selectedPreset = isContextTab ? stylesByContext[activeTab] : 'formal';

  return (
    <div className="max-w-[860px] mx-auto w-full px-6 md:px-10 pt-8 pb-24 space-y-6">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--flow-text)]">
        Style
      </h1>

      {/* Tabs row matching Screenshot 1 */}
      <div
        className="flex items-center gap-6 overflow-x-auto border-b border-[var(--flow-border-subtle)]"
        role="tablist"
        aria-label="Style categories"
      >
        {STYLE_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2.5 text-[14px] inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors relative cursor-pointer ${
                active
                  ? 'text-[var(--flow-text)] font-medium'
                  : 'text-[var(--flow-text-muted)] hover:text-[var(--flow-text)]'
              }`}
            >
              <span>{tab.label}</span>
              {tab.beta && (
                <span className="rounded-[6px] bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] px-1.5 py-0.5 text-[11px] font-medium leading-none">
                  Beta
                </span>
              )}
              {active && (
                <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[var(--flow-text)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {isContextTab && contextMeta ? (
        <div className="space-y-5">
          {/* Banner matching Screenshot 1 */}
          <section className="banner-style rounded-[18px] px-7 py-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="max-w-[440px]">
              <h2 className="font-serif-display text-[25px] md:text-[27px] font-normal tracking-[-0.01em] text-white leading-snug">
                {contextMeta.headline}
              </h2>
              <p className="mt-2 text-[13.5px] text-white/80 leading-relaxed">
                {contextMeta.description}
              </p>
            </div>

            <div className="flex items-center -space-x-1.5 shrink-0">
              {contextMeta.icons.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    title={item.label}
                    className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm border border-white/15 flex items-center justify-center"
                  >
                    <span
                      className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white shadow-xs"
                      style={{ backgroundColor: item.bg }}
                    >
                      <Icon size={15} />
                    </span>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  updateSettings({ activeContext: activeTab });
                  pushToast(`Set ${activeTab} as active dictation context`, 'success');
                }}
                title="Use this style as active dictation context"
                aria-label={`Activate ${activeTab} style context`}
                className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white/90 transition-colors cursor-pointer"
              >
                <Plus size={17} />
              </button>
            </div>
          </section>

          {/* Note directly under banner as requested */}
          <p className="text-[12.5px] text-[var(--flow-text-muted)]">
            Style formatting only applies in English. More languages coming soon.
          </p>

          {/* 3 selectable cards matching Screenshot 1 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="radiogroup" aria-label="Formatting style">
            {PRESET_CARDS.map((card) => {
              const isSelected = selectedPreset === card.id;
              const sampleText = contextMeta.examples[card.id];
              return (
                <button
                  key={card.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setStylePreset(activeTab, card.id);
                    updateSettings({ activeContext: activeTab });
                    pushToast(`${card.title.replace('.', '')} style selected`, 'success');
                  }}
                  className={`text-left rounded-[16px] bg-[var(--flow-surface)] p-5 flex flex-col justify-between min-h-[300px] transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'border-[1.5px] border-[var(--flow-accent)] shadow-[0_0_0_1px_rgba(124,77,219,0.12)]'
                      : 'border border-[var(--flow-border)] hover:border-[var(--flow-text-muted)]/60'
                  }`}
                >
                  <div>
                    <div className="text-[14.5px] font-medium text-[var(--flow-text)]">
                      {card.title}
                    </div>
                    <div className="mt-1 text-[13px] text-[var(--flow-text-secondary)]">
                      {card.subtitle}
                    </div>
                  </div>

                  <div className="mt-8 space-y-3">
                    <div className="rounded-[12px] bg-[var(--flow-style-bubble-bg)] px-4 py-3.5 text-[13.5px] leading-[1.55] text-[var(--flow-text)]">
                      {card.id === 'very_casual'
                        ? renderVeryCasualHighlighted(sampleText)
                        : sampleText}
                    </div>

                    <div className="flex justify-end">
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center text-[15px] font-medium select-none"
                        style={{ backgroundColor: card.avatarBg, color: card.avatarText }}
                        aria-hidden="true"
                      >
                        J
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Auto cleanup (Beta) tab with toggles + live Img 5 before/after comparison */
        <div className="space-y-4">
          <section className="banner-style rounded-[18px] px-7 py-5 text-white">
            <h2 className="font-serif-display text-[24px] md:text-[26px] font-normal tracking-[-0.01em] text-white leading-snug">
              Speak naturally, <em className="italic">Flow</em> polishes the rest.
            </h2>
            <p className="mt-1.5 text-[13.5px] text-white/80 max-w-[560px] leading-relaxed">
              Automatically remove filler words, resolve mid-sentence corrections, and apply crisp punctuation before text is inserted.
            </p>
          </section>

          <p className="text-[12.5px] text-[var(--flow-text-muted)]">
            Style formatting only applies in English.
          </p>

          {/* 4 Cleanup Toggles */}
          <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] divide-y divide-[var(--flow-border-subtle)] overflow-hidden">
            {CLEANUP_TOGGLES.map((item) => {
              const checked = cleanupConfig[item.key];
              return (
                <label
                  key={item.key}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[var(--flow-surface-hover)] transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-[14.5px] font-medium text-[var(--flow-text)]">
                      {item.title}
                    </div>
                    <p className="mt-0.5 text-[13px] text-[var(--flow-text-muted)]">
                      {item.description}
                    </p>
                  </div>

                  <span className="relative inline-flex shrink-0 items-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => updateCleanupConfig({ [item.key]: e.target.checked })}
                      aria-label={item.title}
                      className="sr-only peer"
                    />
                    <span className="w-10 h-6 rounded-full bg-[var(--flow-border)] peer-checked:bg-[var(--flow-accent)] transition-colors after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:w-[18px] after:h-[18px] after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:after:translate-x-4" />
                  </span>
                </label>
              );
            })}
          </div>

          {/* Live Before/After comparison card modeled directly on Screenshot 5 */}
          <section aria-label="Live cleanup preview" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Standard dictation card */}
            <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-5 flex flex-col justify-between min-h-[210px]">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[var(--flow-text)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--flow-text-muted)]/60" aria-hidden="true" />
                    Standard dictation
                  </span>
                  {demoRaw !== DEFAULT_DEMO_RAW && (
                    <button
                      type="button"
                      onClick={() => setDemoRaw(DEFAULT_DEMO_RAW)}
                      className="text-[11.5px] text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
                    >
                      Reset sample
                    </button>
                  )}
                </div>

                <textarea
                  value={demoRaw}
                  onChange={(e) => setDemoRaw(e.target.value)}
                  aria-label="Standard dictation sample input"
                  rows={4}
                  className="w-full resize-none bg-transparent text-[15px] leading-[1.6] text-[var(--flow-text-secondary)] focus:outline-none"
                />
              </div>
              <p className="text-[11.5px] text-[var(--flow-text-muted)] mt-2">
                Edit the raw speech above to test cleanup toggles live
              </p>
            </div>

            {/* Flow polished output card */}
            <div className="rounded-[18px] bg-[var(--flow-surface)] border-[1.5px] border-[var(--flow-text)]/80 dark:border-[var(--flow-accent)] p-5 flex flex-col justify-between min-h-[210px]">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-[var(--flow-text)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--flow-text)]" aria-hidden="true" />
                    Flow
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {liveCleanupPreview.fillerRemovedCount > 0 && (
                      <span className="rounded-full bg-[var(--flow-chip-filler-bg)] text-[var(--flow-chip-filler-text)] px-2.5 py-0.5 text-[11.5px] font-medium">
                        Filler removed
                      </span>
                    )}
                    {liveCleanupPreview.correctionsAppliedCount > 0 && (
                      <span className="rounded-full bg-[var(--flow-chip-correction-bg)] text-[var(--flow-chip-correction-text)] px-2.5 py-0.5 text-[11.5px] font-medium">
                        Correction applied
                      </span>
                    )}
                  </div>
                </div>

                <p
                  className="text-[15.5px] leading-[1.6] text-[var(--flow-text)]"
                  data-testid="cleanup-preview-output"
                >
                  {liveCleanupPreview.text || 'Type raw speech on the left to preview…'}
                </p>
              </div>

              <div className="pt-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--flow-primary-btn)] text-[var(--flow-primary-btn-text)] px-3 py-1 text-[12px] font-medium">
                  <Check size={12} strokeWidth={2.6} />
                  Polished &amp; ready to send
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
