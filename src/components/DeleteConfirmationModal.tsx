// =============================================================================
// DeleteConfirmationModal — reusable confirmation dialog for soft-delete actions
// =============================================================================
//
// PURPOSE
//   Provides a consistent, branded confirmation experience for every delete /
//   remove / deactivate action in the system. Replaces the browser's native
//   confirm() dialog with a modal that:
//   - Shows what record is being deleted (name, reference, key details)
//   - Explains the soft-delete behaviour (restorable from Trash & Audit)
//   - Offers Cancel and Confirm buttons with appropriate destructive styling
//   - Is keyboard-accessible (Escape to close, focus trapped)
//   - Works on mobile (responsive, touch-friendly)
//
// USAGE
//   <DeleteConfirmationModal
//     open={showDeleteModal}
//     title="Delete Deposit"
//     recordLabel="KCB deposit of $15,000 on Jan 15"
//     recordDetails={['Ref: DEP-2024-0042', 'Source: Sunday collections']}
//     onConfirm={() => handleDelete(selectedId)}
//     onCancel={() => setShowDeleteModal(false)}
//   />
//
// =============================================================================
import React, { useEffect, useRef } from 'react';

export interface DeleteConfirmationModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Header text, e.g. "Delete Deposit" or "Deactivate Employee" */
  title: string;
  /** Primary identification of the record, e.g. "KCB deposit of $15,000" */
  recordLabel: string;
  /** Optional extra lines of detail about the record */
  recordDetails?: string[];
  /** Called when the user confirms the deletion */
  onConfirm: () => void;
  /** Called when the user cancels or clicks outside */
  onCancel: () => void;
  /** Override the confirm button text (default: "Confirm Delete") */
  confirmLabel?: string;
  /** Whether the confirm action is in progress (disables button, shows spinner) */
  loading?: boolean;
}

/**
 * DeleteConfirmationModal — accessible, branded confirmation dialog for
 * soft-delete actions. Rendered as a fixed fullscreen overlay with a centered
 * card. Handles Escape key, focus trapping, and click-outside-to-close.
 */
export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  open,
  title,
  recordLabel,
  recordDetails,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm Delete',
  loading = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when the modal opens (slight delay for render)
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => confirmBtnRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  // Focus trap
  useEffect(() => {
    if (!open || !modalRef.current) return;
    const modal = modalRef.current;
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTab);
    return () => modal.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning header */}
        <div className="flex items-center gap-3 text-[#ba1a1a]">
          <span className="material-symbols-outlined text-2xl">warning</span>
          <h4 id="delete-modal-title" className="text-base font-bold">{title}</h4>
        </div>

        {/* Record identification */}
        <p className="text-xs text-[#444748]">
          Are you sure you want to delete{' '}
          <strong className="text-[#1a1c1c]">{recordLabel}</strong>?
        </p>

        {/* Optional extra details */}
        {recordDetails && recordDetails.length > 0 && (
          <div className="bg-[#f4f3f3] rounded-lg p-3 space-y-1">
            {recordDetails.map((detail, i) => (
              <p key={i} className="text-[11px] text-[#444748]">{detail}</p>
            ))}
          </div>
        )}

        {/* Soft-delete explanation */}
        <p className="text-[11px] text-[#888] leading-relaxed">
          This record will be moved to Trash. You can restore it anytime from{' '}
          <strong>Administration → Trash &amp; Audit</strong>.
        </p>

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-3 border-t border-[#e1e3e3]">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs font-medium text-[#444748] hover:bg-[#f4f3f3] rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-1.5 text-xs font-bold text-white bg-[#ba1a1a] hover:bg-[#961212] rounded ${
              loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                Deleting...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
