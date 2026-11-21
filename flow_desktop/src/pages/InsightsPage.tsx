import { useMemo, useState } from 'react';
import { useFlowStore } from '../store/useFlowStore';
import { computeInsights } from '../utils/textPipeline';

const HEATMAP_COLORS = [
  'bg-[var(--flow-surface-muted)] border border-[var(--flow-border-subtle)]',
  'bg-[#E6E0FB] dark:bg-[#31264D]',
  'bg-[#C6B2F7] dark:bg-[#4B3480]',
  'bg-[#9B74F2] dark:bg-[#6A45BE]',
  'bg-[#7C4DDB] dark:bg-[#8E65EC]',
];

export function InsightsPage() {
  const history = useFlowStore((s) => s.history);
  const setActivePage = useFlowStore((s) => s.setActivePage);
  const [range, setRange] = useState<7 | 30>(7);

  const summary = useMemo(() => computeInsights(history, range), [history, range]);
  const maxBarWords = useMemo(
    () => Math.max(10, ...summary.dailyBars.map((d) => d.words)),
    [summary.dailyBars]
  );

  // Build WPM SVG polyline points
  const wpmChart = useMemo(() => {
    const pts = summary.wpmTrend;
    if (pts.length === 0) return null;
    const width = 440;
    const height = 140;
    const padX = 20;
    const padY = 18;
    const values = pts.map((p) => p.wpm);
    const minVal = Math.max(40, Math.min(...values) - 20);
    const maxVal = Math.max(minVal + 20, Math.max(...values) + 15);

    const coords = pts.map((p, idx) => {
      const x =
        pts.length === 1
          ? width / 2
          : padX + (idx / (pts.length - 1)) * (width - padX * 2);
      const y = height - padY - ((p.wpm - minVal) / (maxVal - minVal)) * (height - padY * 2);
      return { x, y, ...p };
    });

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`;

    return { width, height, coords, linePath, areaPath, minVal, maxVal };
  }, [summary.wpmTrend]);

  return (
    <div className="max-w-[960px] mx-auto w-full px-6 md:px-10 pt-8 pb-24 space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--flow-text)]">
            Insights
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--flow-text-muted)]">
            Computed locally from your {summary.totalSessions} saved{' '}
            {summary.totalSessions === 1 ? 'dictation' : 'dictations'}
          </p>
        </div>

        <div
          className="inline-flex items-center gap-1 p-1 rounded-[11px] bg-[var(--flow-surface-muted)] border border-[var(--flow-border)]"
          role="group"
          aria-label="Date range"
        >
          <button
            type="button"
            onClick={() => setRange(7)}
            className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              range === 7
                ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
            }`}
          >
            Last 7 days
          </button>
          <button
            type="button"
            onClick={() => setRange(30)}
            className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              range === 30
                ? 'bg-[var(--flow-surface)] text-[var(--flow-text)] shadow-xs'
                : 'text-[var(--flow-text-secondary)] hover:text-[var(--flow-text)]'
            }`}
          >
            Last 30 days
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="rounded-[20px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-12 text-center space-y-3">
          <p className="font-serif-display text-[22px] text-[var(--flow-text)]">
            No dictation data yet
          </p>
          <p className="text-[14px] text-[var(--flow-text-muted)] max-w-[380px] mx-auto">
            Record a dictation to see your speaking speed, time saved, streak calendar, and cleaned filler words.
          </p>
          <button
            type="button"
            onClick={() => setActivePage('dictation')}
            className="mt-2 rounded-[11px] bg-[var(--flow-primary-btn)] text-[var(--flow-primary-btn-text)] px-4 py-2 text-[13.5px] font-medium cursor-pointer"
          >
            Go to Dictation
          </button>
        </div>
      ) : (
        <>
          {/* 4 KPI Summary Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-5">
              <span className="text-[12.5px] text-[var(--flow-text-muted)]">Total words</span>
              <div className="mt-2 font-serif-display text-[32px] leading-none text-[var(--flow-text)] tabular-nums">
                {summary.totalWords.toLocaleString()}
              </div>
              <p className="mt-2 text-[12px] text-[var(--flow-text-secondary)] tabular-nums">
                Across {summary.totalSessions} sessions
              </p>
            </div>

            <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-5">
              <span className="text-[12.5px] text-[var(--flow-text-muted)]">Average speed</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-serif-display text-[32px] leading-none text-[var(--flow-text)] tabular-nums">
                  {summary.avgWpm}
                </span>
                <span className="text-[13.5px] text-[var(--flow-text-secondary)]">wpm</span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--flow-text-secondary)] tabular-nums">
                {summary.avgWpm > 42 ? `${(summary.avgWpm / 42).toFixed(1)}× faster than typing` : 'Measured live'}
              </p>
            </div>

            <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-5">
              <span className="text-[12.5px] text-[var(--flow-text-muted)]">Time saved</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-serif-display text-[32px] leading-none text-[var(--flow-text)] tabular-nums">
                  {summary.timeSavedMinutes}
                </span>
                <span className="text-[13.5px] text-[var(--flow-text-secondary)]">min</span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--flow-text-secondary)]">
                Compared to 42 wpm typing
              </p>
            </div>

            <div className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-5">
              <span className="text-[12.5px] text-[var(--flow-text-muted)]">Fillers removed</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif-display text-[32px] leading-none text-[var(--flow-text)] tabular-nums">
                  {summary.totalFillersRemoved}
                </span>
                <span className="rounded-full bg-[var(--flow-chip-filler-bg)] text-[var(--flow-chip-filler-text)] px-2 py-0.5 text-[11px] font-medium">
                  Auto cleanup
                </span>
              </div>
              <p className="mt-2 text-[12px] text-[var(--flow-text-secondary)] tabular-nums">
                {summary.totalCorrectionsApplied} self-corrections fixed
              </p>
            </div>
          </section>

          {/* Words Per Day Bar Chart */}
          <section className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--flow-text)]">Words per day</h2>
                <p className="text-[12.5px] text-[var(--flow-text-muted)]">
                  Daily dictated volume over the last {range} days
                </p>
              </div>
              <span className="text-[12.5px] text-[var(--flow-text-secondary)] tabular-nums">
                Peak: {Math.max(...summary.dailyBars.map((d) => d.words))} words
              </span>
            </div>

            <div className="h-[190px] flex items-end gap-1.5 sm:gap-2.5 pt-4">
              {summary.dailyBars.map((bar, idx) => {
                const heightPct = bar.words > 0 ? Math.max(8, Math.round((bar.words / maxBarWords) * 100)) : 3;
                const showLabel = range === 7 || idx % 5 === 0 || idx === summary.dailyBars.length - 1;
                return (
                  <div key={bar.dateKey} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <div className="relative w-full flex-1 flex items-end justify-center">
                      {/* Hover tooltip */}
                      <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-[#1C1C1C] text-white px-2 py-1 text-[11px] whitespace-nowrap shadow-md tabular-nums">
                        {bar.label}: {bar.words}w
                      </div>
                      <div
                        className={`w-full max-w-[38px] rounded-t-[7px] transition-all duration-200 ${
                          bar.words > 0
                            ? 'bg-[var(--flow-accent)]/85 group-hover:bg-[var(--flow-accent)]'
                            : 'bg-[var(--flow-border)]/70'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="mt-2 text-[11px] text-[var(--flow-text-muted)] tabular-nums h-4 truncate max-w-full">
                      {showLabel ? bar.label : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Lower 2-column grid: WPM Trend + Streak Calendar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* WPM Trend */}
            <section className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-[var(--flow-text)]">WPM trend</h2>
                  <p className="text-[12.5px] text-[var(--flow-text-muted)]">
                    Speaking pace across recent sessions
                  </p>
                </div>
                <span className="font-serif-display text-[22px] text-[var(--flow-text)] tabular-nums">
                  {summary.avgWpm} <span className="text-[12px] font-sans text-[var(--flow-text-muted)]">avg</span>
                </span>
              </div>

              {wpmChart ? (
                <div className="w-full">
                  <svg
                    viewBox={`0 0 ${wpmChart.width} ${wpmChart.height}`}
                    className="w-full h-[155px] overflow-visible"
                    role="img"
                    aria-label="Words per minute trend line chart"
                  >
                    <defs>
                      <linearGradient id="wpmFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--flow-accent)" stopOpacity="0.24" />
                        <stop offset="100%" stopColor="var(--flow-accent)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Subtle horizontal gridlines */}
                    {[0.25, 0.5, 0.75].map((ratio) => (
                      <line
                        key={ratio}
                        x1={20}
                        x2={wpmChart.width - 20}
                        y1={18 + ratio * (wpmChart.height - 36)}
                        y2={18 + ratio * (wpmChart.height - 36)}
                        stroke="var(--flow-border-subtle)"
                        strokeDasharray="3 4"
                      />
                    ))}

                    <path d={wpmChart.areaPath} fill="url(#wpmFill)" />
                    <path
                      d={wpmChart.linePath}
                      fill="none"
                      stroke="var(--flow-accent)"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {wpmChart.coords.map((pt, idx) => (
                      <g key={idx}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          fill="var(--flow-surface)"
                          stroke="var(--flow-accent)"
                          strokeWidth="2.2"
                        />
                        <title>
                          {pt.label}: {pt.wpm} wpm
                        </title>
                      </g>
                    ))}
                  </svg>
                  <div className="flex items-center justify-between text-[11px] text-[var(--flow-text-muted)] tabular-nums px-2">
                    <span>{wpmChart.coords[0]?.label}</span>
                    <span>{wpmChart.coords[Math.floor(wpmChart.coords.length / 2)]?.label}</span>
                    <span>{wpmChart.coords[wpmChart.coords.length - 1]?.label}</span>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-[var(--flow-text-muted)] py-10 text-center">
                  Dictate a few sessions to plot your WPM trend.
                </p>
              )}
            </section>

            {/* Daily Streak Calendar */}
            <section className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-[var(--flow-text)]">
                    Daily streak calendar
                  </h2>
                  <p className="text-[12.5px] text-[var(--flow-text-muted)]">
                    Last 5 weeks of dictation activity
                  </p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif-display text-[24px] leading-none text-[var(--flow-text)] tabular-nums">
                    {summary.dayStreak}
                  </span>
                  <span className="text-[12px] text-[var(--flow-text-muted)]">
                    {summary.dayStreak === 1 ? 'day streak' : 'days streak'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {summary.streakCalendar.map((cell) => (
                  <div
                    key={cell.dateKey}
                    title={`${cell.dateKey}: ${cell.words} words`}
                    className={`aspect-square rounded-[8px] flex items-center justify-center text-[11px] tabular-nums transition-transform hover:scale-105 ${
                      HEATMAP_COLORS[cell.level]
                    } ${
                      cell.level >= 3
                        ? 'text-white font-medium'
                        : 'text-[var(--flow-text-muted)]'
                    }`}
                  >
                    {cell.dayOfMonth}
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-[var(--flow-text-muted)]">
                <span>Less</span>
                {HEATMAP_COLORS.map((cls, idx) => (
                  <span key={idx} className={`w-3 h-3 rounded-[3px] ${cls}`} />
                ))}
                <span>More</span>
              </div>
            </section>
          </div>

          {/* Most-used apps (manual tags) */}
          <section className="rounded-[18px] bg-[var(--flow-surface)] border border-[var(--flow-border)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
              <div>
                <h2 className="text-[16px] font-semibold text-[var(--flow-text)]">Most-used apps</h2>
                <p className="text-[12.5px] text-[var(--flow-text-muted)]">
                  Based on your selected app tags on Dictation history entries
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('dictation')}
                className="text-[12.5px] font-medium text-[var(--flow-accent)] hover:underline cursor-pointer"
              >
                Manage tags in Dictation
              </button>
            </div>

            <div className="space-y-3.5">
              {summary.appBreakdown.map((item) => (
                <div key={item.app} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[13.5px]">
                    <span className="font-medium text-[var(--flow-text)]">{item.app}</span>
                    <span className="text-[var(--flow-text-secondary)] tabular-nums">
                      {item.words.toLocaleString()} words · {item.percentage}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--flow-surface-muted)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--flow-accent)] transition-all duration-300"
                      style={{ width: `${Math.max(4, item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
