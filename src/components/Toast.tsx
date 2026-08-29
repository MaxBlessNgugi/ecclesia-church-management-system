// =============================================================================
// Toast — lightweight success/error notification hook
// =============================================================================
// Replaces alert() calls with non-blocking auto-dismissing banners.
// Uses the same visual pattern (emerald-50 / red-50 cards) the codebase
// already had for per-view notifications, but centralised so every module
// shares one implementation.
// =============================================================================
import { useState, useCallback } from 'react';

type ToastType = 'success' | 'error';

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; text: string; icon: string; duration: number }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', icon: 'check_circle', duration: 4000 },
  error:   { bg: 'bg-red-50',     border: 'border-red-300',     text: 'text-red-800',     icon: 'error',        duration: 6000 },
};

/**
 * Hook returning showSuccess / showError. Each call sets a banner that
 * auto-dismisses after a few seconds. Only one toast shows at a time
 * (new replaces old) — matches the original per-view pattern.
 */
export const useToast = () => {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const show = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    const duration = TOAST_STYLES[type].duration;
    setTimeout(() => setToast(null), duration);
  }, []);

  const toastEl = toast ? (() => {
    const s = TOAST_STYLES[toast.type];
    return (
      <div className={`p-3.5 ${s.bg} border ${s.border} rounded-lg ${s.text} text-xs font-medium flex items-center gap-2 animate-in fade-in`}>
        <span className="material-symbols-outlined text-base">{s.icon}</span>
        <span>{toast.message}</span>
      </div>
    );
  })() : null;

  return {
    showSuccess: useCallback((msg: string) => show(msg, 'success'), [show]),
    showError:   useCallback((msg: string) => show(msg, 'error'), [show]),
    toastEl,
  };
};
