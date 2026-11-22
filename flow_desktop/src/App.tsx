import { useEffect } from 'react';
import { Moon, PanelLeft, Sun } from 'lucide-react';
import { useFlowStore } from './store/useFlowStore';
import { hotkeyProvider } from './services/hotkeys';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { ToastStack } from './components/Toast';
import { DictationPage } from './pages/DictationPage';
import { InsightsPage } from './pages/InsightsPage';
import { DictionaryPage } from './pages/DictionaryPage';
import { StylePage } from './pages/StylePage';
import { OverlayRoute } from './pages/OverlayRoute';

function isOverlayPathname(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  const hash = window.location.hash;
  const search = window.location.search;
  return (
    path === '/overlay' ||
    hash.includes('/overlay') ||
    hash.includes('overlay') ||
    search.includes('overlay')
  );
}

export default function App() {
  const activePage = useFlowStore((s) => s.activePage);
  const settings = useFlowStore((s) => s.settings);
  const toggleSidebar = useFlowStore((s) => s.toggleSidebar);
  const toggleTheme = useFlowStore((s) => s.toggleTheme);
  const initHistory = useFlowStore((s) => s.initHistory);
  const setSettingsOpen = useFlowStore((s) => s.setSettingsOpen);
  const startDictation = useFlowStore((s) => s.startDictation);
  const stopDictation = useFlowStore((s) => s.stopDictation);
  const cancelDictation = useFlowStore((s) => s.cancelDictation);

  // Sync light/dark theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Load IndexedDB history on startup
  useEffect(() => {
    void initHistory();
  }, [initHistory]);

  // Register hotkeys with Electron main process and listen for tray open-settings
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    window.electronAPI.updateHotkeys({
      pushToTalk: settings.pushToTalkHotkey,
      handsFree: settings.handsFreeHotkey,
    });

    return window.electronAPI.onOpenSettings(() => {
      setSettingsOpen(true);
    });
  }, [settings.pushToTalkHotkey, settings.handsFreeHotkey, setSettingsOpen]);

  const overlayOnly = isOverlayPathname();

  // Wire global browser hotkey listener for both Push-to-talk and Hands-free shortcuts
  useEffect(() => {
    if (overlayOnly) return;
    return hotkeyProvider.subscribe({
      pushToTalkHotkey: settings.pushToTalkHotkey,
      handsFreeHotkey: settings.handsFreeHotkey,
      onStart: (mode) => void startDictation(mode),
      onStop: () => void stopDictation(),
      onCancel: () => cancelDictation(),
      isListening: () => useFlowStore.getState().overlayState === 'listening',
      getActiveMode: () => useFlowStore.getState().settings.dictationMode,
      isSuspended: () => useFlowStore.getState().isCapturingHotkey,
    });
  }, [
    overlayOnly,
    settings.pushToTalkHotkey,
    settings.handsFreeHotkey,
    startDictation,
    stopDictation,
    cancelDictation,
  ]);

  if (overlayOnly) {
    return <OverlayRoute />;
  }

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[var(--flow-app-bg)] text-[var(--flow-text)] overflow-hidden">
      {/* Slim desktop window top chrome matching Wispr Flow screenshots */}
      <header className="h-[42px] shrink-0 flex items-center justify-between px-3.5 select-none">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
          className="p-1.5 rounded-lg text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)] transition-colors cursor-pointer"
        >
          <PanelLeft size={17} strokeWidth={1.75} />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={settings.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-1.5 rounded-lg text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)] hover:bg-[var(--flow-nav-active)] transition-colors cursor-pointer"
        >
          {settings.theme === 'dark' ? (
            <Sun size={17} strokeWidth={1.75} />
          ) : (
            <Moon size={17} strokeWidth={1.75} />
          )}
        </button>
      </header>

      {/* Main desktop shell: borderless sidebar + inset rounded-24px content panel */}
      <div className="flex-1 min-h-0 flex">
        <Sidebar />

        <main
          className="flex-1 min-w-0 mr-3 mb-3 rounded-[24px] bg-[var(--flow-panel-bg)] overflow-y-auto"
          style={{ boxShadow: 'var(--flow-panel-shadow)' }}
        >
          {activePage === 'dictation' && <DictationPage />}
          {activePage === 'insights' && <InsightsPage />}
          {activePage === 'dictionary' && <DictionaryPage />}
          {activePage === 'style' && <StylePage />}
        </main>
      </div>

      {/* Settings modal & toasts */}
      <SettingsModal />
      <ToastStack />
    </div>
  );
}
