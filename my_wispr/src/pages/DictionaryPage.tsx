import { useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  Pencil,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { parseDictionaryImport, serializeDictionaryExport } from '../utils/textPipeline';
import type { DictionaryEntry } from '../types';

const SUGGESTION_CHIPS = ['Wispr Flow', 'Samir', 'Sara', 'Karol', 'Spyder'];

export function DictionaryPage() {
  const dictionary = useFlowStore((s) => s.dictionary);
  const dismissed = useFlowStore((s) => s.dismissed);
  const dismissBanner = useFlowStore((s) => s.dismissBanner);
  const addDictionaryEntry = useFlowStore((s) => s.addDictionaryEntry);
  const updateDictionaryEntry = useFlowStore((s) => s.updateDictionaryEntry);
  const deleteDictionaryEntry = useFlowStore((s) => s.deleteDictionaryEntry);
  const toggleStarDictionaryEntry = useFlowStore((s) => s.toggleStarDictionaryEntry);
  const importDictionaryEntries = useFlowStore((s) => s.importDictionaryEntries);
  const pushToast = useFlowStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<'all' | 'personal'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'newest' | 'az' | 'za'>('newest');

  // Add / Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DictionaryEntry | null>(null);
  const [entryType, setEntryType] = useState<'word' | 'replacement'>('word');
  const [triggerValue, setTriggerValue] = useState('');
  const [replacementValue, setReplacementValue] = useState('');
  const [starredValue, setStarredValue] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Import / Export modal state
  const [ioModalOpen, setIoModalOpen] = useState(false);
  const [ioTab, setIoTab] = useState<'import' | 'export'>('import');
  const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visibleEntries = useMemo(() => {
    let list = [...dictionary];
    if (activeTab === 'personal') {
      list = list.filter((e) => e.scope === 'personal');
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.trigger.toLowerCase().includes(q) ||
          (e.replacement && e.replacement.toLowerCase().includes(q))
      );
    }

    if (sortMode === 'az') {
      list.sort((a, b) => a.trigger.localeCompare(b.trigger));
    } else if (sortMode === 'za') {
      list.sort((a, b) => b.trigger.localeCompare(a.trigger));
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [dictionary, activeTab, searchQuery, sortMode]);

  const openAddModal = (prefillWord = '') => {
    setEditingEntry(null);
    setEntryType('word');
    setTriggerValue(prefillWord);
    setReplacementValue('');
    setStarredValue(false);
    setFormError(null);
    setEditModalOpen(true);
  };

  const openEditModal = (entry: DictionaryEntry) => {
    setEditingEntry(entry);
    setEntryType(entry.type);
    setTriggerValue(entry.trigger);
    setReplacementValue(entry.replacement ?? '');
    setStarredValue(entry.starred);
    setFormError(null);
    setEditModalOpen(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTrigger = triggerValue.trim();
    const cleanRepl = replacementValue.trim();

    if (!cleanTrigger) {
      setFormError('Please enter a word or spoken trigger.');
      return;
    }
    if (entryType === 'replacement' && !cleanRepl) {
      setFormError('Please enter the replacement text.');
      return;
    }

    if (editingEntry) {
      updateDictionaryEntry(editingEntry.id, {
        type: entryType,
        trigger: cleanTrigger,
        replacement: entryType === 'replacement' ? cleanRepl : undefined,
        starred: starredValue,
      });
      pushToast('Dictionary entry updated', 'success');
    } else {
      addDictionaryEntry({
        type: entryType,
        trigger: cleanTrigger,
        replacement: entryType === 'replacement' ? cleanRepl : undefined,
        starred: starredValue,
      });
      pushToast(`Added "${cleanTrigger}" to Dictionary`, 'success');
    }
    setEditModalOpen(false);
  };

  const handleQuickAddChip = (word: string) => {
    const exists = dictionary.some((d) => d.trigger.toLowerCase() === word.toLowerCase());
    if (exists) {
      pushToast(`"${word}" is already in your dictionary`);
      return;
    }
    addDictionaryEntry({ type: 'word', trigger: word, starred: false });
    pushToast(`Added "${word}" to Dictionary`, 'success');
  };

  const handleCycleSort = () => {
    const next = sortMode === 'newest' ? 'az' : sortMode === 'az' ? 'za' : 'newest';
    setSortMode(next);
    pushToast(
      next === 'az' ? 'Sorted A → Z' : next === 'za' ? 'Sorted Z → A' : 'Sorted by newest'
    );
  };

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    try {
      const parsed = parseDictionaryImport(importText, importFormat);
      if (parsed.length === 0) {
        setImportError('No valid entries found in the provided data.');
        return;
      }
      const added = importDictionaryEntries(parsed);
      pushToast(
        added > 0
          ? `Imported ${added} ${added === 1 ? 'entry' : 'entries'}`
          : 'All entries were already present',
        added > 0 ? 'success' : 'default'
      );
      setImportText('');
      setIoModalOpen(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse import file.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.name.endsWith('.csv')) setImportFormat('csv');
    else if (file.name.endsWith('.json')) setImportFormat('json');

    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ''));
      setImportError(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadExport = (format: 'json' | 'csv') => {
    const content = serializeDictionaryExport(dictionary, format);
    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow-dictionary.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    pushToast(`Exported ${dictionary.length} entries as ${format.toUpperCase()}`, 'success');
  };

  return (
    <div className="max-w-[820px] mx-auto w-full px-6 md:px-10 pt-8 pb-24 space-y-6">
      {/* Header matching Screenshot 3 */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--flow-text)]">
          Dictionary
        </h1>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setIoTab('import');
              setImportError(null);
              setIoModalOpen(true);
            }}
            className="rounded-[11px] bg-[var(--flow-primary-btn)] hover:bg-[var(--flow-primary-btn-hover)] text-[var(--flow-primary-btn-text)] px-4 py-2 text-[13.5px] font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            Import
          </button>
          <button
            type="button"
            onClick={() => openAddModal()}
            className="rounded-[11px] bg-[var(--flow-primary-btn)] hover:bg-[var(--flow-primary-btn-hover)] text-[var(--flow-primary-btn-text)] px-4 py-2 text-[13.5px] font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            Add new
          </button>
        </div>
      </div>

      {/* Tabs (All / Personal) + Toolbar icons matching Screenshot 3 */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--flow-border-subtle)]">
        <div className="flex items-center gap-6" role="tablist" aria-label="Dictionary views">
          {(['all', 'personal'] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab)}
                className={`pb-2.5 text-[14px] transition-colors relative cursor-pointer ${
                  active
                    ? 'text-[var(--flow-text)] font-medium'
                    : 'text-[var(--flow-text-muted)] hover:text-[var(--flow-text)]'
                }`}
              >
                {tab === 'all' ? 'All' : 'Personal'}
                {active && (
                  <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[var(--flow-text)] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 pb-2">
          {searchOpen && (
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search words…"
              aria-label="Search dictionary"
              autoFocus
              className="w-[180px] rounded-[8px] border border-[var(--flow-border)] bg-[var(--flow-surface)] px-2.5 py-1 text-[12.5px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)] mr-1"
            />
          )}
          <button
            type="button"
            onClick={() => {
              if (searchOpen) setSearchQuery('');
              setSearchOpen(!searchOpen);
            }}
            aria-label="Search dictionary"
            title="Search"
            className="p-1.5 rounded-lg text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            onClick={handleCycleSort}
            aria-label="Sort dictionary"
            title={`Sort (${sortMode})`}
            className="p-1.5 rounded-lg text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
          >
            <ArrowUpDown size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setSortMode('newest');
              setSearchQuery('');
              pushToast('Dictionary synced with local store');
            }}
            aria-label="Refresh dictionary"
            title="Refresh & reset sort"
            className="p-1.5 rounded-lg text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              setIoTab('export');
              setIoModalOpen(true);
            }}
            aria-label="Export dictionary"
            title="Export JSON / CSV"
            className="p-1.5 rounded-lg text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* Dismissible warm brown-to-amber banner matching Screenshot 3 */}
      {!dismissed.dictionaryBanner && (
        <section
          aria-label="Dictionary tips"
          className="banner-dictionary relative overflow-hidden rounded-[18px] px-7 py-6 text-white shadow-xs"
        >
          <button
            type="button"
            onClick={() => dismissBanner('dictionaryBanner')}
            aria-label="Dismiss dictionary banner"
            className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/12 hover:bg-white/22 flex items-center justify-center text-white/90 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>

          <h2 className="font-serif-display text-[26px] md:text-[28px] font-normal tracking-[-0.01em] text-white leading-snug pr-8">
            Flow spells the way <em className="italic">you</em> do.
          </h2>
          <p className="mt-2 text-[13.5px] text-white/85 max-w-[610px] leading-relaxed">
            Correct a spelling once or add it here manually, so your{' '}
            <strong className="font-semibold text-white">
              personal terms, company jargon, or uncommon names
            </strong>{' '}
            are spelled right in both dictations and meeting notes.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openAddModal()}
              className="rounded-[9px] bg-[#F5F4F0] hover:bg-white text-[#1C1C1C] px-4 py-2 text-[13.5px] font-medium transition-colors cursor-pointer"
            >
              Add new word
            </button>

            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleQuickAddChip(chip)}
                title={`Quick add "${chip}"`}
                className="rounded-[9px] bg-[#E6E0D7]/70 hover:bg-[#E6E0D7]/88 backdrop-blur-xs text-[#1F1B18] px-3.5 py-2 text-[13.5px] font-medium transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Dictionary list rows matching Screenshot 3 */}
      {visibleEntries.length === 0 ? (
        <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-[var(--flow-text)]">
            {searchQuery ? 'No matching dictionary entries' : 'Your dictionary is empty'}
          </p>
          <p className="mt-1 text-[13.5px] text-[var(--flow-text-muted)]">
            Add names, acronyms, or shorthand replacements like “btw → by the way”.
          </p>
        </div>
      ) : (
        <div
          className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] divide-y divide-[var(--flow-border-subtle)] overflow-hidden"
          data-testid="dictionary-list"
        >
          {visibleEntries.map((entry) => (
            <div
              key={entry.id}
              className="group flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--flow-surface-hover)] transition-colors"
            >
              <div className="min-w-0 text-[14.5px] text-[var(--flow-text)] truncate">
                {entry.type === 'replacement' && entry.replacement ? (
                  <span>
                    <span className="font-medium">{entry.trigger}</span>
                    <span className="mx-2 text-[var(--flow-text-muted)]" aria-hidden="true">
                      →
                    </span>
                    <span>{entry.replacement}</span>
                  </span>
                ) : (
                  <span>{entry.trigger}</span>
                )}
              </div>

              <div
                className={`flex items-center gap-1 shrink-0 transition-opacity duration-150 ${
                  entry.starred
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openEditModal(entry)}
                  aria-label={`Edit ${entry.trigger}`}
                  title="Edit"
                  className="p-1.5 rounded-lg text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)] cursor-pointer"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteDictionaryEntry(entry.id);
                    pushToast(`Removed "${entry.trigger}"`);
                  }}
                  aria-label={`Delete ${entry.trigger}`}
                  title="Delete"
                  className="p-1.5 rounded-lg text-[var(--flow-text-secondary)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleStarDictionaryEntry(entry.id)}
                  aria-label={entry.starred ? `Unstar ${entry.trigger}` : `Star ${entry.trigger}`}
                  title={entry.starred ? 'Unstar' : 'Star'}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    entry.starred
                      ? 'text-amber-500'
                      : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)]'
                  }`}
                >
                  <Star size={15} fill={entry.starred ? 'currentColor' : 'none'} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Dictionary Entry Modal */}
      {editModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dict-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditModalOpen(false);
          }}
        >
          <form
            onSubmit={handleSaveEntry}
            className="w-full max-w-[440px] rounded-[20px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 id="dict-modal-title" className="text-[18px] font-semibold text-[var(--flow-text)]">
                {editingEntry ? 'Edit dictionary entry' : 'Add dictionary entry'}
              </h2>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            {/* Type switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)]">
              <button
                type="button"
                onClick={() => setEntryType('word')}
                className={`rounded-[7px] py-1.5 text-[13px] font-medium cursor-pointer transition-colors ${
                  entryType === 'word'
                    ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                    : 'text-[var(--flow-text-secondary)]'
                }`}
              >
                Spelling / Word
              </button>
              <button
                type="button"
                onClick={() => setEntryType('replacement')}
                className={`rounded-[7px] py-1.5 text-[13px] font-medium cursor-pointer transition-colors ${
                  entryType === 'replacement'
                    ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                    : 'text-[var(--flow-text-secondary)]'
                }`}
              >
                Replacement (→)
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="dict-trigger-input"
                  className="block text-[12.5px] font-medium text-[var(--flow-text-secondary)] mb-1"
                >
                  {entryType === 'word' ? 'Word or phrase' : 'Spoken shorthand'}
                </label>
                <input
                  id="dict-trigger-input"
                  type="text"
                  value={triggerValue}
                  onChange={(e) => {
                    setTriggerValue(e.target.value);
                    setFormError(null);
                  }}
                  placeholder={
                    entryType === 'word'
                      ? 'e.g. Kubernetes, Wispr Flow, Stewart Gauld'
                      : 'e.g. btw, k8s, hii'
                  }
                  autoFocus
                  className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] px-3 text-[14px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                />
              </div>

              {entryType === 'replacement' && (
                <div>
                  <label
                    htmlFor="dict-replacement-input"
                    className="block text-[12.5px] font-medium text-[var(--flow-text-secondary)] mb-1"
                  >
                    Replace with
                  </label>
                  <input
                    id="dict-replacement-input"
                    type="text"
                    value={replacementValue}
                    onChange={(e) => {
                      setReplacementValue(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="e.g. by the way, Kubernetes, Hai"
                    className="w-full h-10 leading-normal rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] px-3 text-[14px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                  />
                </div>
              )}

              <label className="inline-flex items-center gap-2 text-[13px] text-[var(--flow-text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={starredValue}
                  onChange={(e) => setStarredValue(e.target.checked)}
                  className="rounded accent-[var(--flow-accent)]"
                />
                <span>Star this entry</span>
              </label>
            </div>

            {formError && (
              <p className="text-[12.5px] text-red-600 dark:text-red-400" role="alert">
                {formError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="rounded-[10px] border border-[var(--flow-border)] px-3.5 py-2 text-[13px] font-medium text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-[10px] bg-[var(--flow-primary-btn)] hover:bg-[var(--flow-primary-btn-hover)] text-[var(--flow-primary-btn-text)] px-4 py-2 text-[13px] font-medium cursor-pointer"
              >
                {editingEntry ? 'Save changes' : 'Add entry'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Import / Export Modal */}
      {ioModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="io-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIoModalOpen(false);
          }}
        >
          <div className="w-full max-w-[500px] rounded-[20px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="io-modal-title" className="text-[18px] font-semibold text-[var(--flow-text)]">
                Import &amp; Export Dictionary
              </h2>
              <button
                type="button"
                onClick={() => setIoModalOpen(false)}
                aria-label="Close import modal"
                className="p-1.5 rounded-lg text-[var(--flow-text-muted)] hover:text-[var(--flow-text)] cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-[10px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)]">
              <button
                type="button"
                onClick={() => setIoTab('import')}
                className={`rounded-[7px] py-1.5 text-[13px] font-medium cursor-pointer ${
                  ioTab === 'import'
                    ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                    : 'text-[var(--flow-text-secondary)]'
                }`}
              >
                Import
              </button>
              <button
                type="button"
                onClick={() => setIoTab('export')}
                className={`rounded-[7px] py-1.5 text-[13px] font-medium cursor-pointer ${
                  ioTab === 'export'
                    ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                    : 'text-[var(--flow-text-secondary)]'
                }`}
              >
                Export
              </button>
            </div>

            {ioTab === 'import' ? (
              <form onSubmit={handleImportSubmit} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[12.5px]">
                    <span className="text-[var(--flow-text-secondary)]">Format:</span>
                    <button
                      type="button"
                      onClick={() => setImportFormat('json')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        importFormat === 'json'
                          ? 'bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] font-medium'
                          : 'text-[var(--flow-text-muted)]'
                      }`}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportFormat('csv')}
                      className={`px-2.5 py-1 rounded-md cursor-pointer ${
                        importFormat === 'csv'
                          ? 'bg-[var(--flow-accent-soft)] text-[var(--flow-accent)] font-medium'
                          : 'text-[var(--flow-text-muted)]'
                      }`}
                    >
                      CSV
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--flow-border)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--flow-text)] hover:bg-[var(--flow-surface-hover)] cursor-pointer"
                  >
                    <Upload size={13} />
                    Choose file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv,text/csv,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportError(null);
                  }}
                  rows={6}
                  placeholder={
                    importFormat === 'json'
                      ? '[{"type":"replacement","trigger":"k8s","replacement":"Kubernetes"},{"type":"word","trigger":"Wayland"}]'
                      : 'type,trigger,replacement,starred\nreplacement,k8s,Kubernetes,false\nword,Wayland,,true'
                  }
                  className="w-full rounded-[10px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] p-3 font-mono text-[12px] text-[var(--flow-text)] focus:outline-none focus:border-[var(--flow-accent)]"
                />

                {importError && (
                  <p className="text-[12.5px] text-red-600 dark:text-red-400" role="alert">
                    {importError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIoModalOpen(false)}
                    className="rounded-[10px] border border-[var(--flow-border)] px-3.5 py-2 text-[13px] text-[var(--flow-text-secondary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-[10px] bg-[var(--flow-primary-btn)] text-[var(--flow-primary-btn-text)] px-4 py-2 text-[13px] font-medium cursor-pointer"
                  >
                    Import entries
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-[13.5px] text-[var(--flow-text-secondary)]">
                  Download all {dictionary.length} entries to back up or share with your transcription server.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleDownloadExport('json')}
                    className="flex items-center justify-center gap-2 rounded-[12px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] hover:bg-[var(--flow-surface-hover)] py-3 text-[13.5px] font-medium text-[var(--flow-text)] cursor-pointer"
                  >
                    <Download size={15} />
                    Download JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadExport('csv')}
                    className="flex items-center justify-center gap-2 rounded-[12px] border border-[var(--flow-border)] bg-[var(--flow-panel-bg)] hover:bg-[var(--flow-surface-hover)] py-3 text-[13.5px] font-medium text-[var(--flow-text)] cursor-pointer"
                  >
                    <Download size={15} />
                    Download CSV
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
