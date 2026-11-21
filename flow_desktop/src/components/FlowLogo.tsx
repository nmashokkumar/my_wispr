export function FlowLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 select-none">
      {/* Authentic 5-bar Flow waveform mark */}
      <svg
        width="22"
        height="20"
        viewBox="0 0 22 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 text-[var(--flow-text)]"
        aria-hidden="true"
      >
        <rect x="1.5" y="4" width="2.4" height="12" rx="1.2" fill="currentColor" />
        <rect x="5.6" y="7" width="2.4" height="6" rx="1.2" fill="currentColor" />
        <rect x="9.8" y="2" width="2.4" height="16" rx="1.2" fill="currentColor" />
        <rect x="14" y="5.5" width="2.4" height="9" rx="1.2" fill="currentColor" />
        <rect x="18.2" y="8" width="2.4" height="4" rx="1.2" fill="currentColor" />
      </svg>
      {!compact && (
        <span className="text-[19px] font-bold tracking-[-0.03em] text-[var(--flow-text)] leading-none">
          Flow
        </span>
      )}
    </div>
  );
}
