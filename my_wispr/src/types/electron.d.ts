export interface ElectronAPI {
  isElectron: boolean;
  onDictationStart: (callback: (data: { mode: 'push_to_talk' | 'hands_free' }) => void) => () => void;
  onDictationStop: (callback: (data: { mode: 'push_to_talk' | 'hands_free' }) => void) => () => void;
  onDictationToggle: (callback: (data: { mode: 'push_to_talk' | 'hands_free' }) => void) => () => void;
  onDictationTrigger: (callback: (data: { mode: 'push_to_talk' | 'hands_free' }) => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
  updateHotkeys: (hotkeys: { pushToTalk: any; handsFree: any }) => Promise<{ success: boolean; pttAcc?: string; hfAcc?: string }>;
  injectText: (text: string) => Promise<{ success: boolean; error?: string }>;
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
  showDashboard: () => void;
  hideOverlay: () => void;
  showOverlay: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
