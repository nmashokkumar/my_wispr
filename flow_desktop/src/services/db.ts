import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { HistoryEntry } from '../types';

interface FlowDBSchema extends DBSchema {
  history: {
    key: string;
    value: HistoryEntry;
    indexes: { 'by-timestamp': number };
  };
}

const DB_NAME = 'flow-dictation-db';
const DB_VERSION = 1;
const SEED_FLAG_KEY = 'flow_history_seeded_v1';

let dbPromise: Promise<IDBPDatabase<FlowDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<FlowDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<FlowDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('history')) {
          const store = db.createObjectStore('history', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

export async function loadAllHistory(): Promise<HistoryEntry[]> {
  const db = await getDb();
  const existing = await db.getAllFromIndex('history', 'by-timestamp');
  return existing.sort((a, b) => b.timestamp - a.timestamp);
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
    window.localStorage.removeItem(SEED_FLAG_KEY);
  }
}

export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  await db.clear('history');
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
}
