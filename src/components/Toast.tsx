// =============================================================================
// Toast — app-wide success/error notifications
// -----------------------------------------------------------------------------
// One ToastProvider renders the banner itself (fixed at the top of the screen),
// so showing a toast is a one-line call from anywhere in the app:
//
//   const { showSuccess, showError } = useToast();
//   showSuccess('Saved');
//
// Views never place a toast element in their JSX — which removes the failure
// mode this app actually hit: a view destructured the hook's element and never
// rendered it, so every message died silently. There is no element to forget.
// Only one toast shows at a time (new replaces old); auto-dismisses after a
// few seconds.
// =============================================================================
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type ToastType = 'success' | 'error';

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; text: string; icon: string; duration: number }> = {
  success: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', icon: 'check_circle', duration: 4000 },
  error:   { bg: 'bg-red-50',     border: 'border-red-300',     text: 'text-red-800',     icon: 'error',        duration: 6000 },
};

const ToastContext = createContext<{
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const show = (message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), TOAST_STYLES[type].duration);
  };

  const style = toast ? TOAST_STYLES[toast.type] : null;

  return (
    <ToastContext.Provider value={{ showSuccess: (m) => show(m, 'success'), showError: (m) => show(m, 'error') }}>
      {children}
      {toast && style && (
        <div
          role="status"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[80] max-w-md shadow-lg p-3.5 ${style.bg} border ${style.border} rounded-lg ${style.text} text-xs font-medium flex items-center gap-2 animate-in fade-in`}
        >
          <span className="material-symbols-outlined text-base">{style.icon}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** Access the app-wide toast controls. Must be used inside <ToastProvider>. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
