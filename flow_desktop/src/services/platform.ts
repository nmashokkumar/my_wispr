/**
 * Platform abstraction for OS-level actions.
 * In Electron on Ubuntu/Wayland, delegates to window.electronAPI.injectText(text)
 * which writes to Wayland clipboard + PRIMARY selection and triggers synthetic
 * paste into the active window using ydotool Shift+Insert.
 */
export interface PlatformBridge {
  insertText(text: string): Promise<boolean>;
  copyToClipboard(text: string): Promise<boolean>;
  registerTestInputSink(sink: ((text: string) => void) | null): void;
}

class DesktopPlatformBridge implements PlatformBridge {
  private testInputSink: ((text: string) => void) | null = null;

  registerTestInputSink(sink: ((text: string) => void) | null): void {
    this.testInputSink = sink;
  }

  async insertText(text: string): Promise<boolean> {
    if (!text) return false;

    // Always deliver to active in-app test sink if one is mounted (e.g. DictationPage test box)
    if (this.testInputSink) {
      this.testInputSink(text);
    }

    // If running in Electron daemon, inject into active external window
    if (typeof window !== 'undefined' && window.electronAPI?.injectText) {
      try {
        const res = await window.electronAPI.injectText(text);
        return Boolean(res?.success);
      } catch (err) {
        console.error('Electron text injection failed:', err);
      }
    }

    // Web browser fallback: write to clipboard
    return this.copyToClipboard(text);
  }

  async copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback for insecure contexts / iframe clipboard restrictions
    }

    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(el);
      return copied;
    } catch {
      return false;
    }
  }
}

export const platform: PlatformBridge = new DesktopPlatformBridge();
