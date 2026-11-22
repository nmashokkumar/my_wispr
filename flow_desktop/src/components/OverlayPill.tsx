import React from 'react';
import { Mic, Check, Loader2 } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';

interface OverlayPillProps {
  /** When true, renders inside the standalone /overlay transparent window */
  standalone?: boolean;
}

export function OverlayPill({ standalone = false }: OverlayPillProps) {
  const overlayState = useFlowStore((s) => s.overlayState);
  const audioLevels = useFlowStore((s) => s.audioLevels);
  const overlayError = useFlowStore((s) => s.overlayError);
  const dictationMode = useFlowStore((s) => s.settings.dictationMode);

  const stopDictation = useFlowStore((s) => s.stopDictation);

  // Interactive mouse bounds for Electron click-through on the tick button
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
  // Pipe "|" and tick "✓" must appear ONLY in Hands-Free mode when actively dictating
  const showHandsFreeTick = isHandsFree && overlayState === 'listening';

  // Standalone check: only renders in /overlay window
  if (!standalone) {
    return null;
  }

  // Keep overlay hidden when idle
  if (overlayState === 'idle') {
    return null;
  }

  // Audio levels for animated fluid waveform
  const levels = audioLevels && audioLevels.length >= 8
    ? audioLevels.slice(0, 8)
    : [0.18, 0.35, 0.5, 0.85, 0.65, 0.45, 0.3, 0.2];

  return (
    <div
      className="w-full h-full flex items-center justify-center bg-transparent select-none"
      data-testid="flow-overlay"
      data-overlay-state={overlayState}
    >
      <div className="flex items-center justify-center pointer-events-auto">
        {/* LISTENING STATE */}
        {overlayState === 'listening' && (
          <div
            className="relative flex items-center gap-2.5 h-[42px] px-4 rounded-full bg-[#121214]/95 border border-white/12 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all duration-200 select-none overflow-hidden"
            style={{ minWidth: showHandsFreeTick ? '190px' : '150px' }}
          >
            {/* Ambient orange glow behind the pill */}
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-32 h-6 pointer-events-none rounded-full blur-md opacity-70"
              style={{
                background: 'radial-gradient(circle, rgba(255,106,0,0.85) 0%, rgba(255,150,0,0.4) 60%, transparent 100%)',
              }}
            />

            {/* Left: White Microphone Icon */}
            <div className="relative z-10 flex items-center justify-center shrink-0">
              <Mic size={16} strokeWidth={2.4} className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
            </div>

            {/* Middle: "Listening" Text with Glowing Soundwave Underneath */}
            <div className="relative z-10 flex flex-col items-center justify-center -space-y-0.5">
              <span className="text-[12.5px] font-medium tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                Listening
              </span>

              {/* Glowing Warm Orange Animated Soundwave */}
              <div
                className="flex items-center justify-center gap-[2.5px] h-2.5 w-full pt-0.5"
                aria-hidden="true"
              >
                {levels.map((lvl, idx) => {
                  const barHeight = Math.max(2.5, Math.min(8.5, Math.round(lvl * 9)));
                  return (
                    <span
                      key={idx}
                      className="w-[2px] rounded-full transition-[height] duration-75"
                      style={{
                        height: `${barHeight}px`,
                        background: 'linear-gradient(180deg, #FFA500 0%, #FF5500 100%)',
                        boxShadow: '0 0 5px rgba(255, 106, 0, 0.8)',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Hands-Free mode only: Pipe "|" and Clickable Tick "✓" button */}
            {showHandsFreeTick && (
              <div className="relative z-10 flex items-center gap-2 pl-0.5 shrink-0">
                <span className="w-px h-3.5 bg-white/20 shrink-0" aria-hidden="true" />

                <button
                  type="button"
                  onClick={handleTickClick}
                  onMouseEnter={handleTickMouseEnter}
                  onMouseLeave={handleTickMouseLeave}
                  aria-label="Commit dictation"
                  title="Finish and insert"
                  className="w-5 h-5 rounded-full flex items-center justify-center text-white/85 hover:text-white hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  <Check size={13} strokeWidth={2.8} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* TRANSCRIBING STATE */}
        {overlayState === 'transcribing' && (
          <div className="flex items-center gap-2.5 h-[40px] px-4 rounded-full bg-[#121214]/95 border border-white/12 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-md text-white select-none">
            <Loader2 size={14} className="text-white animate-spin shrink-0" />
            <span className="text-[12.5px] font-medium text-white/95 whitespace-nowrap">
              Transcribing…
            </span>
          </div>
        )}

        {/* DONE / INSERTED STATE */}
        {overlayState === 'done' && (
          <div className="flex items-center gap-2 h-[40px] px-4 rounded-full bg-[#121214]/95 border border-white/12 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-md text-white select-none">
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/25 text-emerald-400">
              <Check size={11} strokeWidth={3} />
            </span>
            <span className="text-[12.5px] font-medium text-white/95 whitespace-nowrap">
              Inserted
            </span>
          </div>
        )}

        {/* ERROR STATE */}
        {overlayState === 'error' && (
          <div className="flex items-center gap-2 h-[40px] px-3.5 rounded-full bg-[#1c1214]/95 border border-red-500/30 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-md text-white select-none">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="text-[11.5px] font-medium text-red-200/90 max-w-[200px] truncate">
              {overlayError || 'Dictation failed'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
