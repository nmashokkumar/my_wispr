import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLocalCleanupPipeline,
  computeInsights,
  countStrippedFillersAndCorrections,
  countWords,
  groupHistoryByDate,
  parseDictionaryImport,
  serializeDictionaryExport,
} from './textPipeline';
import type { AutoCleanupConfig, DictionaryEntry, HistoryEntry } from '../types';

const allCleanupOn: AutoCleanupConfig = {
  removeFillerWords: true,
  applySelfCorrections: true,
  autoPunctuation: true,
  autoCapitalization: true,
};

test('removes filler words, applies self-corrections, and punctuates like Wispr Flow example', () => {
  const raw =
    'um so can you send the the report to Sarah by uh Thursday actually no Friday and let her know its nearly done';
  const result = applyLocalCleanupPipeline(raw, {
    style: 'formal',
    context: 'work',
    cleanup: allCleanupOn,
    dictionary: [],
  });

  assert.equal(result.text, "Can you send the report to Sarah by Friday? Let her know it's nearly done.");
  assert.ok(result.fillerRemovedCount >= 2, 'should count removed fillers');
  assert.ok(result.correctionsAppliedCount >= 2, 'should count self-corrections and stutter fixes');
});

test('applies dictionary replacements and exact spelling words', () => {
  const dict: DictionaryEntry[] = [
    { id: '1', type: 'replacement', trigger: 'btw', replacement: 'by the way', starred: false, scope: 'personal', createdAt: 1 },
    { id: '2', type: 'word', trigger: 'Wispr Flow', starred: true, scope: 'personal', createdAt: 2 },
  ];

  const result = applyLocalCleanupPipeline('btw i love using wispr flow every day', {
    style: 'formal',
    context: 'personal',
    cleanup: allCleanupOn,
    dictionary: dict,
  });

  assert.equal(result.text, 'By the way I love using Wispr Flow every day.');
  assert.equal(result.dictionaryAppliedCount, 2);
});

test('style presets produce distinct formal, casual, and very_casual outputs', () => {
  const raw = 'hey, are you free for lunch tomorrow? let us do 12 if that works for you';

  const formal = applyLocalCleanupPipeline(raw, {
    style: 'formal',
    context: 'personal',
    cleanup: allCleanupOn,
    dictionary: [],
  });
  const casual = applyLocalCleanupPipeline(raw, {
    style: 'casual',
    context: 'personal',
    cleanup: allCleanupOn,
    dictionary: [],
  });
  const veryCasual = applyLocalCleanupPipeline(raw, {
    style: 'very_casual',
    context: 'personal',
    cleanup: allCleanupOn,
    dictionary: [],
  });

  assert.ok(formal.text.startsWith('Hey,') && formal.text.endsWith('.'));
  assert.ok(casual.text.startsWith('Hey ') && !casual.text.endsWith('.'));
  assert.ok(veryCasual.text.startsWith('hey ') && !veryCasual.text.endsWith('.'));
});

test('computes accurate insights from local dictation history', () => {
  const now = new Date('2026-11-21T15:00:00Z').getTime();
  const entries: HistoryEntry[] = [
    {
      id: 'h1',
      text: 'Hello team this is a quick update for today',
      rawText: 'um hello team this is a quick update for today',
      durationMs: 3000,
      timestamp: now - 3600000,
      styleUsed: 'formal',
      contextUsed: 'work',
      appTag: 'Slack',
      flagged: false,
      fillerRemovedCount: 1,
      correctionsAppliedCount: 0,
      language: 'en',
    },
    {
      id: 'h2',
      text: 'Can we meet tomorrow at three',
      rawText: 'can we meet tomorrow at three',
      durationMs: 2000,
      timestamp: now - 86400000,
      styleUsed: 'casual',
      contextUsed: 'email',
      appTag: 'Gmail',
      flagged: false,
      fillerRemovedCount: 2,
      correctionsAppliedCount: 1,
      language: 'en',
    },
  ];

  const summary = computeInsights(entries, 7, now);
  assert.equal(summary.totalWords, countWords(entries[0].text) + countWords(entries[1].text));
  assert.equal(summary.dayStreak, 2);
  assert.equal(summary.totalFillersRemoved, 3);
  assert.equal(summary.dailyBars.length, 7);
  assert.equal(summary.streakCalendar.length, 35);
  assert.equal(summary.appBreakdown.length, 2);
  assert.equal(summary.appBreakdown[0].app, 'Slack');
});

test('counts stripped fillers and self-corrections by comparing raw_text vs formatted_text', () => {
  const raw =
    'um basically can you send the the report to Sarah by uh Thursday actually no Friday you know like like soon';
  const formatted = 'Can you send the report to Sarah by Friday soon?';
  const diff = countStrippedFillersAndCorrections(raw, formatted);
  assert.equal(diff.fillersRemoved, 5); // um, basically, uh, you know, like like
  assert.equal(diff.correctionsFixed, 2); // "the the" + "actually no"
});

test('groups history into TODAY, YESTERDAY, and formatted dates', () => {
  const now = new Date('2026-11-21T15:00:00Z').getTime();
  const makeEntry = (id: string, ts: number): HistoryEntry => ({
    id,
    text: 'sample',
    rawText: 'sample',
    durationMs: 1000,
    timestamp: ts,
    styleUsed: 'formal',
    contextUsed: 'other',
    appTag: 'Notes',
    flagged: false,
    fillerRemovedCount: 0,
    correctionsAppliedCount: 0,
    language: 'en',
  });

  const groups = groupHistoryByDate(
    [makeEntry('a', now - 1000), makeEntry('b', now - 86400000), makeEntry('c', now - 3 * 86400000)],
    now
  );
  assert.equal(groups.length, 3);
  assert.equal(groups[0].label, 'TODAY');
  assert.equal(groups[1].label, 'YESTERDAY');
  assert.match(groups[2].label, /NOV/);
});

test('dictionary JSON and CSV export/import round-trips cleanly', () => {
  const initial: DictionaryEntry[] = [
    { id: '1', type: 'word', trigger: 'stewart@syndeo.co.nz', starred: true, scope: 'personal', createdAt: 10 },
    { id: '2', type: 'replacement', trigger: 'btw', replacement: 'by the way', starred: false, scope: 'personal', createdAt: 20 },
  ];

  const jsonStr = serializeDictionaryExport(initial, 'json');
  const fromJson = parseDictionaryImport(jsonStr, 'json');
  assert.equal(fromJson.length, 2);
  assert.equal(fromJson[1].replacement, 'by the way');

  const csvStr = serializeDictionaryExport(initial, 'csv');
  const fromCsv = parseDictionaryImport(csvStr, 'csv');
  assert.equal(fromCsv.length, 2);
  assert.equal(fromCsv[0].trigger, 'stewart@syndeo.co.nz');
  assert.equal(fromCsv[0].starred, true);
  assert.equal(fromCsv[1].type, 'replacement');
  assert.equal(fromCsv[1].replacement, 'by the way');
});
