import { type ReactNode } from 'react';

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
  children?: ReactNode;
};

export default function ConfirmDialog({ open, title, message, confirmText = 'تأكيد', cancelText = 'إلغاء', onConfirm, onCancel, danger, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative card w-full max-w-md p-6 animate-scale">
        {title && <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>}
        {message && <p className="text-slate-600 mb-4">{message}</p>}
        {children}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onCancel} className="btn-ghost">{cancelText}</button>
          <button onClick={onConfirm} className={danger ? 'btn-danger' : 'btn-primary'}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
