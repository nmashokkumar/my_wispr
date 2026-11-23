import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useFlowStore } from '../store/useFlowStore';

export function ToastStack() {
  const toasts = useFlowStore((s) => s.toasts);
  const dismissToast = useFlowStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-12 right-5 z-50 flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-[12px] bg-[#1C1C1C] dark:bg-[#F2F1EC] text-white dark:text-[#161614] px-3.5 py-2.5 text-[13px] font-medium shadow-lg max-w-[340px]"
        >
          {toast.tone === 'success' && <CheckCircle2 size={15} className="text-emerald-400 dark:text-emerald-600 shrink-0" />}
          {toast.tone === 'error' && <AlertCircle size={15} className="text-red-400 dark:text-red-600 shrink-0" />}
          {toast.tone === 'default' && <Info size={15} className="text-white/70 dark:text-black/60 shrink-0" />}
          <span className="leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="ml-1 opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
