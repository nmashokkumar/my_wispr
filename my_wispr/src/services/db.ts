import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DictionaryEntry, HistoryEntry } from '../types';

interface FlowDBSchema extends DBSchema {
  history: {
    key: string;
    value: HistoryEntry;
    indexes: { 'by-timestamp': number };
  };
  dictionary: {
    key: string;
    value: DictionaryEntry;
    indexes: { 'by-createdAt': number };
  };
}

const DB_NAME = 'flow-dictation-db';
const DB_VERSION = 2;
const HISTORY_SEED_FLAG_KEY = 'flow_history_seeded_v1';
const DICT_SEED_FLAG_KEY = 'flow_dictionary_idb_migrated_v1';
const LEGACY_DICT_STORAGE_KEY = 'flow_dictionary_v1';

let dbPromise: Promise<IDBPDatabase<FlowDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<FlowDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<FlowDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('dictionary')) {
          const dictStore = db.createObjectStore('dictionary', { keyPath: 'id' });
          dictStore.createIndex('by-createdAt', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

export const DEFAULT_DICTIONARY_ENTRIES: DictionaryEntry[] = [
  {
    id: 'dict-1',
    type: 'word',
    trigger: 'stewart@syndeo.co.nz',
    starred: false,
    scope: 'personal',
    createdAt: Date.now() - 100000,
  },
  {
    id: 'dict-2',
    type: 'word',
    trigger: 'Stewart Gauld',
    starred: true,
    scope: 'personal',
    createdAt: Date.now() - 200000,
  },
  {
    id: 'dict-3',
    type: 'replacement',
    trigger: 'btw',
    replacement: 'by the way',
    starred: true,
    scope: 'personal',
    createdAt: Date.now() - 300000,
  },
  {
    id: 'dict-4',
    type: 'word',
    trigger: 'Wispr Flow',
    starred: false,
    scope: 'personal',
    createdAt: Date.now() - 400000,
  },
  {
    id: 'dict-5',
    type: 'word',
    trigger: 'Kubernetes',
    starred: false,
    scope: 'personal',
    createdAt: Date.now() - 500000,
  },
];

function createInitialSeedEntries(): HistoryEntry[] {
  const now = Date.now();
  const hour = 3600 * 1000;
  const day = 24 * hour;

  return [
    {
      id: 'seed-1',
      text: "Hey Emma, I hope you had a fantastic weekend. I'm just following up on the reports that you sent through. Can you please go over those reports and also update me on everything that happened last week? Can you also let me know if you messaged Jack and if Jack is still working on that different report that you sent through to him?\n\nLet me know. Great, talk soon.",
      rawText:
        "um hey emma i hope you had a fantastic weekend im just following up on the the reports that you sent through can you please go over those reports and uh also update me on everything that happened last week can you also let me know if you messaged jack and if jack is still working on that different report that you sent through to him let me know great talk soon",
      audioBlob: null,
      durationMs: 24500,
      timestamp: now - 25 * 60 * 1000,
      styleUsed: 'standard',
      appTag: 'Gmail',
      flagged: false,
      fillerRemovedCount: 2,
      correctionsAppliedCount: 1,
      language: 'en',
    },
    {
      id: 'seed-2',
      text: "Hey Emma, I hope you had a fantastic weekend. I'm just reaching out about our Monday catch-up at 5 pm tonight.\nI wanted to follow up with the form that you created. Is this for all internal and external users or just our internal users that are currently testing the app? Please let me know.\nAlso for the agenda, I want to create a list of the five things that we need to cover:\n- the form\n- outreach\n- the landing page\n- the new marketing strategy",
      rawText:
        "uh hey emma i hope you had a fantastic weekend im just reaching out about our monday catch-up at 4 pm actually no 5 pm tonight i wanted to follow up with the form that you created is this for all internal and external users or just our internal users that are currently testing the app please let me know",
      audioBlob: null,
      durationMs: 29800,
      timestamp: now - 42 * 60 * 1000,
      styleUsed: 'standard',
      appTag: 'Slack',
      flagged: false,
      fillerRemovedCount: 1,
      correctionsAppliedCount: 1,
      language: 'en',
    },
    {
      id: 'seed-3',
      text: "Can you send the report to Sarah by Friday? Let her know it's nearly done.",
      rawText:
        'um so can you send the the report to Sarah by uh Thursday actually no Friday and let her know its nearly done',
      audioBlob: null,
      durationMs: 6200,
      timestamp: now - 2 * hour,
      styleUsed: 'standard',
      appTag: 'Slack',
      flagged: true,
      fillerRemovedCount: 2,
      correctionsAppliedCount: 2,
      language: 'en',
    },
    {
      id: 'seed-4',
      text: "Hey, are you free for lunch tomorrow? Let's do 12 if that works for you.",
      rawText: 'um hey are you free for lunch tomorrow lets do 12 if that works for you',
      audioBlob: null,
      durationMs: 5100,
      timestamp: now - day - 2 * hour,
      styleUsed: 'standard',
      appTag: 'WhatsApp',
      flagged: false,
      fillerRemovedCount: 1,
      correctionsAppliedCount: 0,
      language: 'en',
    },
    {
      id: 'seed-5',
      text: 'The meeting has moved to 3 pm tomorrow. Can everyone bring their slides?',
      rawText: 'uh the meeting has moved to 2 pm actually no 3 pm tomorrow can everyone bring their slides',
      audioBlob: null,
      durationMs: 4800,
      timestamp: now - day - 5 * hour,
      styleUsed: 'standard',
      appTag: 'Linear',
      flagged: false,
      fillerRemovedCount: 1,
      correctionsAppliedCount: 1,
      language: 'en',
    },
    {
      id: 'seed-6',
      text: 'By the way, I pushed the updated Wayland compositor hotkeys branch to GitHub. Ready for review whenever you have a few minutes.',
      rawText:
        'um btw i pushed the updated wayland compositor hotkeys branch to github ready for review whenever you have a few minutes',
      audioBlob: null,
      durationMs: 8400,
      timestamp: now - 2 * day - hour,
      styleUsed: 'standard',
      appTag: 'VS Code',
      flagged: false,
      fillerRemovedCount: 1,
      correctionsAppliedCount: 0,
      language: 'en',
    },
    {
      id: 'seed-7',
      text: 'Quick summary from the product sync: ship local IndexedDB history first, verify push-to-talk latency on Ubuntu, then wire the Seamless M4T endpoint.',
      rawText:
        'uh basically quick summary from the product sync ship local indexeddb history first verify push-to-talk latency on ubuntu then wire the seamless m4t endpoint',
      audioBlob: null,
      durationMs: 9200,
      timestamp: now - 3 * day - 3 * hour,
      styleUsed: 'standard',
      appTag: 'Notion',
      flagged: false,
      fillerRemovedCount: 2,
      correctionsAppliedCount: 0,
      language: 'en',
    },
  ];
}

export async function loadAllHistory(): Promise<HistoryEntry[]> {
  const db = await getDb();
  const existing = await db.getAllFromIndex('history', 'by-timestamp');

  if (existing.length === 0 && typeof window !== 'undefined' && !window.localStorage.getItem(HISTORY_SEED_FLAG_KEY)) {
    const seeds = createInitialSeedEntries();
    const tx = db.transaction('history', 'readwrite');
    for (const item of seeds) {
      await tx.store.put(item);
    }
    await tx.done;
    window.localStorage.setItem(HISTORY_SEED_FLAG_KEY, '1');
    return seeds.sort((a, b) => b.timestamp - a.timestamp);
  }

  return existing.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getHistoryEntryById(id: string): Promise<HistoryEntry | undefined> {
  const db = await getDb();
  return db.get('history', id);
}

export async function saveHistoryEntry(entry: HistoryEntry): Promise<void> {
  const db = await getDb();
  await db.put('history', entry);
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('history', id);
}

export async function clearAllHistory(): Promise<void> {
  const db = await getDb();
  await db.clear('history');
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(HISTORY_SEED_FLAG_KEY, '1');
  }
}

/**
 * Loads custom dictionary entries from IndexedDB, migrating any legacy localStorage
 * entries or seeding initial defaults on first launch.
 */
export async function loadAllDictionary(): Promise<DictionaryEntry[]> {
  const db = await getDb();
  const existing = await db.getAllFromIndex('dictionary', 'by-createdAt');

  if (existing.length > 0) {
    return existing.sort((a, b) => b.createdAt - a.createdAt);
  }

  if (typeof window !== 'undefined' && !window.localStorage.getItem(DICT_SEED_FLAG_KEY)) {
    let initialEntries = DEFAULT_DICTIONARY_ENTRIES;
    try {
      const legacyRaw = window.localStorage.getItem(LEGACY_DICT_STORAGE_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialEntries = parsed;
        }
      }
    } catch {
      // Fall back to defaults
    }

    const tx = db.transaction('dictionary', 'readwrite');
    for (const entry of initialEntries) {
      await tx.store.put(entry);
    }
    await tx.done;
    window.localStorage.setItem(DICT_SEED_FLAG_KEY, '1');
    return [...initialEntries].sort((a, b) => b.createdAt - a.createdAt);
  }

  return [];
}

export async function saveDictionaryEntryDb(entry: DictionaryEntry): Promise<void> {
  const db = await getDb();
  await db.put('dictionary', entry);
}

export async function bulkSaveDictionaryEntriesDb(entries: DictionaryEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('dictionary', 'readwrite');
  for (const entry of entries) {
    await tx.store.put(entry);
  }
  await tx.done;
}

export async function deleteDictionaryEntryDb(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('dictionary', id);
}
