import { Check, X } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import { formatElapsedTimer } from '../utils/pcmAudio';

interface OverlayPillProps {
  /** When true, centers inside the standalone /overlay transparent route */
  standalone?: boolean;
}

/**
 * Floating bottom-center dictation pill:
 * - IDLE: completely hidden (never clutters the screen when not dictating)
 * - RECORDING (Push-to-talk / Hold): ONLY the 10 live pulsing waveform bars (no shortcut text, no pipe, no tick)
 * - RECORDING (Hands-free / Toggle): 10 live waveform bars + elapsed timer + "|" pipe + simple "✓" finish button
 * - TRANSCRIBING: spinner + "Polishing text..."
 * - DONE: checkmark + "Pasted!"
 * - ERROR: red indicator + error message + dismiss button
 */
export function OverlayPill({ standalone = false }: OverlayPillProps) {
  const overlayState = useFlowStore((s) => s.overlayState);
  const activeRecordingMode = useFlowStore((s) => s.activeRecordingMode);
  const fallbackMode = useFlowStore((s) => s.settings.dictationMode);
  const recordingElapsedMs = useFlowStore((s) => s.recordingElapsedMs);
  const audioLevels = useFlowStore((s) => s.audioLevels);
  const overlayError = useFlowStore((s) => s.overlayError);
  const stopDictation = useFlowStore((s) => s.stopDictation);
  const clearOverlayError = useFlowStore((s) => s.clearOverlayError);

  // Completely hidden when idle
  if (overlayState === 'idle') {
    return null;
  }

  const effectiveMode = activeRecordingMode ?? fallbackMode;
  const isHandsFree = effectiveMode === 'hands_free';

  const containerClass = standalone
    ? 'fixed inset-0 flex items-end justify-center pb-6 pointer-events-none'
    : 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center pointer-events-none';

  return (
    <div
      className={containerClass}
      data-testid="flow-overlay"
      data-overlay-state={overlayState}
      data-recording-mode={effectiveMode}
    >
      <div className="pointer-events-auto flex items-center justify-center">
        {/* RECORDING — Push-to-Talk (Hold): waves ONLY */}
        {overlayState === 'listening' && !isHandsFree && (
          <div
            role="status"
            aria-label="Listening (Push-to-talk)"
            className="flex items-center justify-center rounded-full bg-[#1A1A1A] backdrop-blur-md px-4 h-[40px] shadow-[0_10px_32px_rgba(0,0,0,0.38)] border-[1.5px] border-white/85"
          >
            <span className="flex items-center justify-center gap-[3px] h-6" aria-hidden="true">
              {audioLevels.map((level, idx) => (
                <span
                  key={idx}
                  className="w-[3px] rounded-full bg-white transition-[height] duration-75"
                  style={{ height: `${Math.max(5, Math.round(level * 22))}px` }}
                />
              ))}
            </span>
          </div>
        )}

        {/* RECORDING — Hands-Free (Toggle): waves + elapsed timer + "|" + "✓" button (no hotkey label) */}
        {overlayState === 'listening' && isHandsFree && (
          <div
            role="status"
            aria-label="Listening (Hands-free)"
            className="flex items-center gap-2.5 rounded-full bg-[#1A1A1A] backdrop-blur-md pl-4 pr-2 h-[42px] shadow-[0_10px_32px_rgba(0,0,0,0.38)] border-[1.5px] border-white/85 text-white"
          >
            <span className="flex items-center justify-center gap-[3px] h-6" aria-hidden="true">
              {audioLevels.map((level, idx) => (
                <span
                  key={idx}
                  className="w-[3px] rounded-full bg-white transition-[height] duration-75"
                  style={{ height: `${Math.max(5, Math.round(level * 22))}px` }}
                />
              ))}
            </span>

            <span className="text-[12px] font-medium text-white/75 tabular-nums select-none">
              {formatElapsedTimer(recordingElapsedMs)}
            </span>

            <span className="text-white/25 text-[14px] leading-none select-none" aria-hidden="true">
              |
            </span>

            <button
              type="button"
              onMouseEnter={() => {
                if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
                  window.electronAPI.setIgnoreMouseEvents(false);
                }
              }}
              onMouseLeave={() => {
                if (typeof window !== 'undefined' && window.electronAPI?.setIgnoreMouseEvents) {
                  window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
                }
              }}
              onClick={() => void stopDictation()}
              aria-label="Finish and paste dictation"
              title="Finish & paste"
              className="flex items-center justify-center w-7 h-7 rounded-full bg-white/12 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              <Check size={15} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {/* TRANSCRIBING / POLISHING */}
        {overlayState === 'transcribing' && (
          <div
            className="flex items-center gap-2.5 rounded-full bg-[#1A1A1A] backdrop-blur-md px-4 h-[40px] shadow-[0_10px_32px_rgba(0,0,0,0.35)] border-[1.5px] border-white/80"
            role="status"
            aria-label="Polishing text"
          >
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/25 border-t-white animate-spin shrink-0" />
            <span className="text-[12.5px] font-medium text-white whitespace-nowrap">
              Polishing text…
            </span>
          </div>
        )}

        {/* COPIED / PASTED */}
        {overlayState === 'done' && (
          <div
            className="flex items-center gap-2 rounded-full bg-[#1A1A1A] px-4 h-[40px] shadow-[0_10px_32px_rgba(0,0,0,0.32)] border-[1.5px] border-white/80 text-white"
            role="status"
          >
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white">
              <Check size={11} strokeWidth={2.8} />
            </span>
            <span className="text-[12.5px] font-medium whitespace-nowrap">Pasted!</span>
          </div>
        )}

        {/* ERROR */}
        {overlayState === 'error' && (
          <div
            className="flex items-center gap-2.5 rounded-full bg-[#1A1A1A] px-3.5 py-2 max-w-[340px] shadow-[0_10px_32px_rgba(0,0,0,0.38)] border border-red-400/50 text-white"
            role="alert"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
            <span className="text-[12px] text-white/95 truncate">
              {overlayError || 'Dictation error'}
            </span>
            <button
              type="button"
              onClick={clearOverlayError}
              aria-label="Dismiss error"
              className="p-0.5 rounded-full text-white/65 hover:text-white cursor-pointer shrink-0"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
