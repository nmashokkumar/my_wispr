import type {
  AutoCleanupConfig,
  DictionaryEntry,
  HistoryEntry,
  PipelineTransformResult,
  StyleContext,
  StylePreset,
} from '../types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function estimateWpm(wordCount: number, durationMs: number): number {
  if (wordCount <= 0 || durationMs <= 0) return 0;
  const minutes = durationMs / 60000;
  return Math.max(1, Math.round(wordCount / minutes));
}

const INSIGHTS_FILLER_REGEX = /\b(um+|uh+|er+|ah+|you know|basically|like like)\b/gi;
const SELF_CORRECTION_PHRASE_REGEX =
  /\b(?:actually\s+no|wait\s+no|no\s+wait|sorry\s+no|or\s+rather)\b/gi;
const WORD_STUTTER_REGEX = /\b([a-z]+)\s+\1\b/gi;

function countRegexMatches(text: string, regex: RegExp): number {
  if (!text) return 0;
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Compares raw verbatim speech against cleaned formatted_text to count fillers
 * and self-corrections that were stripped by the cleanup LLM.
 */
export function countStrippedFillersAndCorrections(
  rawText: string,
  formattedText: string
): { fillersRemoved: number; correctionsFixed: number } {
  const raw = rawText.trim();
  const formatted = formattedText.trim();
  if (!raw || !formatted) {
    return { fillersRemoved: 0, correctionsFixed: 0 };
  }

  const rawFillers = countRegexMatches(raw, INSIGHTS_FILLER_REGEX);
  const formattedFillers = countRegexMatches(formatted, INSIGHTS_FILLER_REGEX);
  const fillersRemoved = Math.max(0, rawFillers - formattedFillers);

  const rawNoFillers = raw.replace(INSIGHTS_FILLER_REGEX, ' ');
  const formattedNoFillers = formatted.replace(INSIGHTS_FILLER_REGEX, ' ');

  const rawCorrections =
    countRegexMatches(raw, SELF_CORRECTION_PHRASE_REGEX) +
    countRegexMatches(rawNoFillers, WORD_STUTTER_REGEX);
  const formattedCorrections =
    countRegexMatches(formatted, SELF_CORRECTION_PHRASE_REGEX) +
    countRegexMatches(formattedNoFillers, WORD_STUTTER_REGEX);
  const correctionsFixed = Math.max(0, rawCorrections - formattedCorrections);

  return { fillersRemoved, correctionsFixed };
}

export function applyLocalCleanupPipeline(
  rawText: string,
  options: {
    style: StylePreset;
    context: StyleContext;
    cleanup: AutoCleanupConfig;
    dictionary: DictionaryEntry[];
  }
): PipelineTransformResult {
  let text = rawText.replace(/\s+/g, ' ').trim();
  if (!text) {
    return {
      text: '',
      fillerRemovedCount: 0,
      correctionsAppliedCount: 0,
      dictionaryAppliedCount: 0,
    };
  }

  let fillerRemovedCount = 0;
  let correctionsAppliedCount = 0;
  let dictionaryAppliedCount = 0;

  // 1. Remove filler words (um, uh, er, ah, you know, leading "um so")
  if (options.cleanup.removeFillerWords) {
    const multiWordFillers = [
      /\b(?:you know|i mean|kind of like|sort of like)\b[,]?\s*/gi,
      /^(?:um+|uh+|er+|ah+|hmm+)[,\s]+(?:so\b[,\s]*)/i,
      /^(?:um+|uh+|er+|ah+|hmm+|so|well)[,\s]+(?=(?:can|could|would|please|hey|hi|let|we|i|the|this|that)\b)/i,
      /\b(?:um+|uh+|er+|ah+|hmm+)\b[,]?\s*/gi,
    ];
    for (const pattern of multiWordFillers) {
      text = text.replace(pattern, () => {
        fillerRemovedCount += 1;
        return '';
      });
    }
    text = text.replace(/\s+/g, ' ').trim();
  }

  // 2. Apply self-corrections & repeated-word stutter cleanup
  if (options.cleanup.applySelfCorrections) {
    // Handle explicit self-corrections like "Thursday actually no Friday" or "3pm, wait no 4pm"
    const selfCorrectionPattern =
      /\b([A-Za-z0-9:]+)[,\s]+(?:actually\s+no|wait\s+no|no\s+wait|sorry\s+no|or\s+rather|actually)[,\s]+([A-Za-z0-9:]+)\b/gi;
    text = text.replace(selfCorrectionPattern, (_match, _wrong, corrected) => {
      correctionsAppliedCount += 1;
      return corrected;
    });

    // Deduplicate immediate stutters ("the the report" -> "the report")
    const stutterPattern = /\b([A-Za-z]+)\s+\1\b/gi;
    text = text.replace(stutterPattern, (_match, word) => {
      correctionsAppliedCount += 1;
      return word;
    });

    // Common missing-apostrophe contractions
    const contractionFixes: Array<[RegExp, string]> = [
      [/\bits\s+(?=(?:nearly|almost|done|ready|going|not|great|fine|good|working|been)\b)/gi, "it's "],
      [/\bdont\b/gi, "don't"],
      [/\bcant\b/gi, "can't"],
      [/\bwont\b/gi, "won't"],
      [/\blets\b/gi, "let's"],
      [/\bim\b/gi, "I'm"],
    ];
    for (const [regex, replacement] of contractionFixes) {
      text = text.replace(regex, (matched) => {
        correctionsAppliedCount += 1;
        // Preserve leading uppercase if original was capitalized
        if (matched[0] === matched[0].toUpperCase() && replacement[0] !== replacement[0].toUpperCase()) {
          return replacement[0].toUpperCase() + replacement.slice(1);
        }
        return replacement;
      });
    }

    text = text.replace(/\s+/g, ' ').trim();
  }

  // 3. Apply personal dictionary entries (replacements first, then canonical spellings)
  const sortedDict = [...options.dictionary].sort((a, b) => b.trigger.length - a.trigger.length);
  for (const entry of sortedDict) {
    const trigger = entry.trigger.trim();
    if (!trigger) continue;
    const regex = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(trigger)}(?![A-Za-z0-9])`, 'gi');

    if (entry.type === 'replacement' && entry.replacement) {
      const target = entry.replacement.trim();
      text = text.replace(regex, () => {
        dictionaryAppliedCount += 1;
        return target;
      });
    } else if (entry.type === 'word') {
      text = text.replace(regex, (matched) => {
        if (matched !== trigger) {
          dictionaryAppliedCount += 1;
        }
        return trigger;
      });
    }
  }

  // 4. Auto punctuation (sentence splits & question detection)
  if (options.cleanup.autoPunctuation) {
    // Split compound spoken clauses like "by Friday and let her know..." into two sentences
    text = text.replace(
      /(\b(?:can|could|would|should|do|does|did|is|are|will)\b[^?.!]+?)\s+and\s+(let\s+(?:her|him|them|me|us)\s+know\b)/i,
      '$1? $2'
    );

    // Ensure question sentences end with '?'
    const startsAsQuestion = /^(?:can|could|would|should|do|does|did|are|is|will|what|when|where|why|how)\b/i;
    const parts = text.split(/(?<=[.!?])\s+/);
    text = parts
      .map((part) => {
        const clean = part.trim();
        if (!clean) return '';
        if (/[.!?]$/.test(clean)) return clean;
        if (startsAsQuestion.test(clean)) return `${clean}?`;
        return `${clean}.`;
      })
      .filter(Boolean)
      .join(' ');
  }

  // 5. Auto capitalization
  if (options.cleanup.autoCapitalization && options.style !== 'very_casual') {
    // Capitalize standalone "i"
    text = text.replace(/\bi\b/g, 'I');
    // Capitalize start of text and start of sentences
    text = text.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, (m) => m.toUpperCase());
  }

  // 6. Style formatting (Standard / Formal / Casual / Very casual)
  if (options.style === 'standard' || options.style === 'formal') {
    if (options.cleanup.autoPunctuation && !/[.!?]$/.test(text)) {
      text = `${text}.`;
    }
    text = text.replace(/^(Hey|Hi|Hello)\s+(?=[a-zA-Z])/, '$1, ');
  } else if (options.style === 'casual') {
    // Caps + Less punctuation: remove trailing period and greeting comma
    text = text.replace(/^(Hey|Hi|Hello),\s+/, '$1 ');
    text = text.replace(/\.$/, '');
  } else if (options.style === 'very_casual') {
    // No Caps + Less punctuation: lowercase sentence starters and drop trailing period
    text = text.replace(/^(Hey|Hi|Hello),\s+/i, '$1 ');
    text = text.replace(/\.$/, '');
    text = text.replace(/(^\s*[A-Z])|([.!?]\s+[A-Z])/g, (m) => m.toLowerCase());
  }

  return {
    text: text.trim(),
    fillerRemovedCount,
    correctionsAppliedCount,
    dictionaryAppliedCount,
  };
}

export interface DateGroup {
  key: string;
  label: string;
  entries: HistoryEntry[];
}

export function formatTimeShort(timestamp: number): string {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const suffix = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${hours}:${minutes}${suffix}`;
}

export function getDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function groupHistoryByDate(entries: HistoryEntry[], nowMs: number = Date.now()): DateGroup[] {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const todayKey = getDayKey(nowMs);
  const yesterdayKey = getDayKey(nowMs - 86400000);

  const map = new Map<string, DateGroup>();

  for (const entry of sorted) {
    const key = getDayKey(entry.timestamp);
    let group = map.get(key);
    if (!group) {
      let label: string;
      if (key === todayKey) {
        label = 'TODAY';
      } else if (key === yesterdayKey) {
        label = 'YESTERDAY';
      } else {
        label = new Date(entry.timestamp)
          .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          .toUpperCase();
      }
      group = { key, label, entries: [] };
      map.set(key, group);
    }
    group.entries.push(entry);
  }

  return Array.from(map.values());
}

export interface DailyWordPoint {
  dateKey: string;
  label: string;
  words: number;
  sessions: number;
  avgWpm: number;
}

export interface StreakCell {
  dateKey: string;
  dayOfMonth: number;
  words: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface AppUsageRow {
  app: string;
  words: number;
  sessions: number;
  percentage: number;
}

export interface InsightsSummary {
  totalWords: number;
  avgWpm: number;
  dayStreak: number;
  totalSessions: number;
  timeSavedMinutes: number;
  totalFillersRemoved: number;
  totalCorrectionsApplied: number;
  dailyBars: DailyWordPoint[];
  wpmTrend: Array<{ label: string; wpm: number; timestamp: number }>;
  streakCalendar: StreakCell[];
  appBreakdown: AppUsageRow[];
}

const TYPING_BASELINE_WPM = 42;

export function computeInsights(
  entries: HistoryEntry[],
  daysRange: 7 | 30 = 7,
  nowMs: number = Date.now()
): InsightsSummary {
  // Build day-key set for the selected range window (Last 7 days or Last 30 days)
  const rangeKeys = new Set<string>();
  for (let i = daysRange - 1; i >= 0; i -= 1) {
    rangeKeys.add(getDayKey(nowMs - i * 86400000));
  }

  // Track all-time daily words for streak & 35-day streak calendar
  const allWordsByDay = new Map<string, { words: number; durationMs: number; sessions: number }>();
  for (const entry of entries) {
    const words =
      typeof entry.numWords === 'number' && entry.numWords > 0
        ? entry.numWords
        : countWords(entry.text);
    const key = getDayKey(entry.timestamp);
    const dayBucket = allWordsByDay.get(key) ?? { words: 0, durationMs: 0, sessions: 0 };
    dayBucket.words += words;
    dayBucket.durationMs += Math.max(1000, entry.durationMs);
    dayBucket.sessions += 1;
    allWordsByDay.set(key, dayBucket);
  }

  // Filter sessions for KPI cards, WPM trend, and app breakdown by the active range
  const rangeEntries = entries.filter((entry) => rangeKeys.has(getDayKey(entry.timestamp)));

  let totalWords = 0;
  let totalDurationMs = 0;
  let totalFillersRemoved = 0;
  let totalCorrectionsApplied = 0;
  const appStats = new Map<string, { words: number; sessions: number }>();

  for (const entry of rangeEntries) {
    const words =
      typeof entry.numWords === 'number' && entry.numWords > 0
        ? entry.numWords
        : countWords(entry.text);
    totalWords += words;
    totalDurationMs += Math.max(1000, entry.durationMs);

    if (entry.rawText && entry.rawText.trim()) {
      const diff = countStrippedFillersAndCorrections(entry.rawText, entry.text);
      totalFillersRemoved += Math.max(diff.fillersRemoved, entry.fillerRemovedCount ?? 0);
      totalCorrectionsApplied += Math.max(diff.correctionsFixed, entry.correctionsAppliedCount ?? 0);
    } else {
      totalFillersRemoved += entry.fillerRemovedCount ?? 0;
      totalCorrectionsApplied += entry.correctionsAppliedCount ?? 0;
    }

    const appName = entry.appTag || 'General';
    const appBucket = appStats.get(appName) ?? { words: 0, sessions: 0 };
    appBucket.words += words;
    appBucket.sessions += 1;
    appStats.set(appName, appBucket);
  }

  const avgWpm = totalWords > 0 ? estimateWpm(totalWords, totalDurationMs) : 0;

  // Time saved: typing time at 42 WPM minus actual dictation time
  const typingMinutes = totalWords / TYPING_BASELINE_WPM;
  const dictationMinutes = totalDurationMs / 60000;
  const timeSavedMinutes = Math.max(0, Math.round((typingMinutes - dictationMinutes) * 10) / 10);

  // Compute active day streak ending today (or yesterday if no dictation yet today)
  let dayStreak = 0;
  const startOffset = allWordsByDay.has(getDayKey(nowMs)) ? 0 : 1;
  for (let i = startOffset; i < 365; i += 1) {
    const k = getDayKey(nowMs - i * 86400000);
    if (allWordsByDay.has(k)) {
      dayStreak += 1;
    } else {
      break;
    }
  }

  // Daily bar chart points
  const dailyBars: DailyWordPoint[] = [];
  for (let i = daysRange - 1; i >= 0; i -= 1) {
    const ts = nowMs - i * 86400000;
    const dateKey = getDayKey(ts);
    const bucket = allWordsByDay.get(dateKey);
    const d = new Date(ts);
    const label =
      daysRange === 7
        ? d.toLocaleDateString('en-US', { weekday: 'short' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyBars.push({
      dateKey,
      label,
      words: bucket?.words ?? 0,
      sessions: bucket?.sessions ?? 0,
      avgWpm: bucket ? estimateWpm(bucket.words, bucket.durationMs) : 0,
    });
  }

  // WPM trend (last 10 dictations in selected range)
  const wpmTrend = [...rangeEntries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-10)
    .map((entry) => {
      const words =
        typeof entry.numWords === 'number' && entry.numWords > 0
          ? entry.numWords
          : countWords(entry.text);
      return {
        label: formatTimeShort(entry.timestamp),
        wpm: estimateWpm(words, Math.max(1000, entry.durationMs)),
        timestamp: entry.timestamp,
      };
    });

  // 35-day streak calendar heatmap (5 weeks)
  const streakCalendar: StreakCell[] = [];
  for (let i = 34; i >= 0; i -= 1) {
    const ts = nowMs - i * 86400000;
    const dateKey = getDayKey(ts);
    const words = allWordsByDay.get(dateKey)?.words ?? 0;
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (words > 0 && words < 60) level = 1;
    else if (words >= 60 && words < 180) level = 2;
    else if (words >= 180 && words < 350) level = 3;
    else if (words >= 350) level = 4;

    streakCalendar.push({
      dateKey,
      dayOfMonth: new Date(ts).getDate(),
      words,
      level,
    });
  }

  const appBreakdown: AppUsageRow[] = Array.from(appStats.entries())
    .map(([app, stats]) => ({
      app,
      words: stats.words,
      sessions: stats.sessions,
      percentage: totalWords > 0 ? Math.round((stats.words / totalWords) * 100) : 0,
    }))
    .sort((a, b) => b.words - a.words);

  return {
    totalWords,
    avgWpm,
    dayStreak,
    totalSessions: rangeEntries.length,
    timeSavedMinutes,
    totalFillersRemoved,
    totalCorrectionsApplied,
    dailyBars,
    wpmTrend,
    streakCalendar,
    appBreakdown,
  };
}

export function serializeDictionaryExport(
  entries: DictionaryEntry[],
  format: 'json' | 'csv'
): string {
  if (format === 'json') {
    return JSON.stringify(
      entries.map((e) => ({
        type: e.type,
        trigger: e.trigger,
        replacement: e.replacement ?? '',
        starred: e.starred,
      })),
      null,
      2
    );
  }

  const header = 'type,trigger,replacement,starred';
  const rows = entries.map((e) => {
    const safeTrigger = `"${e.trigger.replace(/"/g, '""')}"`;
    const safeRepl = `"${(e.replacement ?? '').replace(/"/g, '""')}"`;
    return `${e.type},${safeTrigger},${safeRepl},${e.starred ? 'true' : 'false'}`;
  });
  return [header, ...rows].join('\n');
}

export function parseDictionaryImport(
  content: string,
  format: 'json' | 'csv'
): Array<Omit<DictionaryEntry, 'id' | 'createdAt' | 'scope'>> {
  const trimmed = content.trim();
  if (!trimmed) return [];

  if (format === 'json') {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error('JSON import must be an array of dictionary entries.');
    }
    const results: Array<Omit<DictionaryEntry, 'id' | 'createdAt' | 'scope'>> = [];
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim()) {
        results.push({ type: 'word', trigger: item.trim(), starred: false });
      } else if (item && typeof item === 'object' && typeof item.trigger === 'string' && item.trigger.trim()) {
        const isReplacement =
          item.type === 'replacement' || (typeof item.replacement === 'string' && item.replacement.trim().length > 0);
        results.push({
          type: isReplacement ? 'replacement' : 'word',
          trigger: item.trigger.trim(),
          replacement: isReplacement ? String(item.replacement ?? '').trim() : undefined,
          starred: Boolean(item.starred),
        });
      }
    }
    return results;
  }

  // CSV parsing (handles quoted fields and optional header row)
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const results: Array<Omit<DictionaryEntry, 'id' | 'createdAt' | 'scope'>> = [];

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (idx === 0 && /^type\s*,/i.test(line)) continue;

    // Parse CSV columns respecting quotes
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());

    if (cols.length === 1 && cols[0]) {
      results.push({ type: 'word', trigger: cols[0], starred: false });
    } else if (cols.length >= 2) {
      const firstLower = cols[0].toLowerCase();
      if (firstLower === 'word' || firstLower === 'replacement') {
        const trigger = cols[1] ?? '';
        const replacement = cols[2] ?? '';
        const starred = (cols[3] ?? '').toLowerCase() === 'true';
        if (trigger) {
          results.push({
            type: firstLower === 'replacement' && replacement ? 'replacement' : 'word',
            trigger,
            replacement: firstLower === 'replacement' && replacement ? replacement : undefined,
            starred,
          });
        }
      } else {
        // Two-column shorthand: trigger,replacement
        const trigger = cols[0];
        const replacement = cols[1];
        if (trigger) {
          results.push({
            type: replacement ? 'replacement' : 'word',
            trigger,
            replacement: replacement || undefined,
            starred: false,
          });
        }
      }
    }
  }

  return results;
}
