import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';

interface OverlayPillProps {
  /** When true, renders inside the standalone /overlay transparent window */
  standalone?: boolean;
}

const RESTING_WAVE_HEIGHTS = [6, 12, 8, 16, 10, 14, 7];

export function OverlayPill({ standalone = false }: OverlayPillProps) {
  const overlayState = useFlowStore((s) => s.overlayState);
  const audioLevels = useFlowStore((s) => s.audioLevels);
  const overlayError = useFlowStore((s) => s.overlayError);
  const dictationMode = useFlowStore((s) => s.settings.dictationMode);
  const pushToTalkHotkey = useFlowStore((s) => s.settings.pushToTalkHotkey);
  const handsFreeHotkey = useFlowStore((s) => s.settings.handsFreeHotkey);

  const startDictation = useFlowStore((s) => s.startDictation);
  const stopDictation = useFlowStore((s) => s.stopDictation);
  const clearOverlayError = useFlowStore((s) => s.clearOverlayError);

  // Compact hotkey label displayed inside the pill
  const activeHotkey = dictationMode === 'push_to_talk' ? pushToTalkHotkey : handsFreeHotkey;
  const hotkeyLabel = activeHotkey.label
    .replace(/\s*\+\s*/g, '+')
    .replace(/Control/gi, 'Ctrl')
    .toLowerCase() === 'fn'
    ? 'fn'
    : activeHotkey.label.replace(/\s*\+\s*/g, '+');

  // Interactive mouse bounds for Electron click-through
  const handleTickMouseEnter = () => {
    if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  };

  const handleTickMouseLeave = () => {
    if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  const handleTickClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (overlayState === 'listening') {
      void stopDictation();
    }
  };

  const isHandsFree = dictationMode === 'hands_free';

  // 7 dynamic bars matching the screenshot's waveform
  const displayLevels = (audioLevels && audioLevels.length >= 7)
    ? audioLevels.slice(0, 7)
    : [0.2, 0.45, 0.3, 0.7, 0.4, 0.55, 0.25];

  // In standalone overlay, the transparent Electron window is already positioned
  // at the exact center-bottom coordinates above the taskbar.
  const containerClass = standalone
    ? 'w-full h-full flex items-center justify-center bg-transparent select-none'
    : 'fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center select-none';

  return (
    <div className={containerClass} data-testid="flow-overlay" data-overlay-state={overlayState}>
      {/* 
        Deep matte black capsule (#121214) modeled directly on the reference image:
        - Non-draggable (fixed at center-bottom)
        - Left: 7 dynamic waveform bars
        - Middle: Hotkey badge (e.g. "fn" or "Ctrl+Space")
        - In Hands-Free mode: pipe "|" and clickable tick button "✓"
        - In Hold mode: only waveform and hotkey badge
      */}
      <div className="flex items-center justify-center pointer-events-auto">
        {(overlayState === 'idle' || overlayState === 'listening') && (
          <div
            className="flex items-center gap-2.5 h-[38px] px-3.5 rounded-full bg-[#121214] border border-white/12 shadow-[0_8px_30px_rgba(0,0,0,0.55)] transition-all duration-150 select-none"
            style={{ minWidth: isHandsFree ? '146px' : '110px' }}
          >
            {/* Dynamic Waveform Bars */}
            <div
              className="flex items-center gap-[2.5px] h-4 shrink-0"
              aria-hidden="true"
            >
              {displayLevels.map((lvl, idx) => {
                const heightPx = overlayState === 'listening'
                  ? Math.max(4, Math.min(20, Math.round(lvl * 24)))
                  : RESTING_WAVE_HEIGHTS[idx % RESTING_WAVE_HEIGHTS.length];
                return (
                  <span
                    key={idx}
                    className="w-[2.5px] rounded-full bg-white transition-[height] duration-75"
                    style={{ height: `${heightPx}px` }}
                  />
                );
              })}
            </div>

            {/* Hotkey Badge (e.g. "fn" or "Ctrl+Space") */}
            <span className="text-[12px] font-mono font-medium text-white/90 shrink-0">
              {hotkeyLabel}
            </span>

            {/* Hands-Free mode only: pipe "|" and clickable tick button */}
            {isHandsFree && (
              <>
                <span className="w-px h-3.5 bg-white/20 shrink-0" aria-hidden="true" />

                <button
                  type="button"
                  onClick={handleTickClick}
                  onMouseEnter={handleTickMouseEnter}
                  onMouseLeave={handleTickMouseLeave}
                  aria-label="Commit dictation"
                  title="Finish and insert"
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  <Check size={13} strokeWidth={2.6} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Transcribing state */}
        {overlayState === 'transcribing' && (
          <div className="flex items-center gap-2 h-[38px] px-4 rounded-full bg-[#121214] border border-white/12 shadow-[0_8px_30px_rgba(0,0,0,0.55)] text-white select-none">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin shrink-0" />
            <span className="text-[12px] font-medium text-white/90 whitespace-nowrap">
              Transcribing…
            </span>
          </div>
        )}

        {/* Done / Inserted state */}
        {overlayState === 'done' && (
          <div className="flex items-center gap-2 h-[38px] px-4 rounded-full bg-[#121214] border border-white/12 shadow-[0_8px_30px_rgba(0,0,0,0.55)] text-white select-none">
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-white/15 text-white">
              <Check size={11} strokeWidth={2.8} />
            </span>
            <span className="text-[12px] font-medium text-white/90 whitespace-nowrap">
              Inserted
            </span>
          </div>
        )}

        {/* Error state */}
        {overlayState === 'error' && (
          <div className="flex items-center gap-2.5 h-[38px] px-3.5 rounded-full bg-[#121214] border border-red-500/40 shadow-[0_8px_30px_rgba(0,0,0,0.55)] text-white select-none max-w-[280px]">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-[11.5px] text-red-200 truncate">
              {overlayError || 'Transcription failed'}
            </span>
            <button
              type="button"
              onClick={clearOverlayError}
              onMouseEnter={handleTickMouseEnter}
              onMouseLeave={handleTickMouseLeave}
              aria-label="Dismiss error"
              className="p-0.5 rounded-full text-white/60 hover:text-white cursor-pointer shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
