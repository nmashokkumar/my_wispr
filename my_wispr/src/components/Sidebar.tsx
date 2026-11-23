import { BarChart2, BookOpen, Mic, Settings } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';
import type { NavPage } from '../types';
import { FlowLogo } from './FlowLogo';

const NAV_ITEMS: Array<{ id: NavPage; label: string; icon: typeof Mic }> = [
  { id: 'dictation', label: 'Dictation', icon: Mic },
  { id: 'insights', label: 'Insights', icon: BarChart2 },
  { id: 'dictionary', label: 'Dictionary', icon: BookOpen },
];

export function Sidebar() {
  const activePage = useFlowStore((s) => s.activePage);
  const setActivePage = useFlowStore((s) => s.setActivePage);
  const sidebarCollapsed = useFlowStore((s) => s.sidebarCollapsed);
  const setSettingsOpen = useFlowStore((s) => s.setSettingsOpen);

  return (
    <aside
      aria-label="Primary navigation"
      className={`flex flex-col justify-between shrink-0 transition-[width] duration-200 select-none ${
        sidebarCollapsed ? 'w-[68px] px-2.5' : 'w-[220px] px-3'
      } pt-1 pb-4`}
    >
      <div>
        <div className={`px-2.5 pt-1 pb-6 flex items-center ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <FlowLogo compact={sidebarCollapsed} />
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                aria-current={isActive ? 'page' : undefined}
                title={sidebarCollapsed ? item.label : undefined}
                className={`group flex items-center gap-3 w-full rounded-[10px] px-3 py-2.5 text-[14.5px] transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                  sidebarCollapsed ? 'justify-center px-0' : ''
                } ${
                  isActive
                    ? 'bg-[var(--flow-nav-active)] text-[var(--flow-text)] font-medium'
                    : 'text-[var(--flow-text-secondary)] hover:bg-[var(--flow-nav-active)]/60 hover:text-[var(--flow-text)] font-normal'
                }`}
              >
                <Icon
                  size={19}
                  strokeWidth={1.75}
                  className={
                    isActive
                      ? 'text-[var(--flow-text)]'
                      : 'text-[var(--flow-text-secondary)] group-hover:text-[var(--flow-text)]'
                  }
                />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open Settings"
          title="Settings"
          className={`flex items-center gap-2.5 w-full rounded-[10px] px-3 py-2 text-[14px] text-[var(--flow-text-secondary)] hover:bg-[var(--flow-nav-active)]/70 hover:text-[var(--flow-text)] transition-colors duration-150 cursor-pointer whitespace-nowrap ${
            sidebarCollapsed ? 'justify-center px-0' : ''
          }`}
        >
          <Settings size={18} strokeWidth={1.75} />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}
