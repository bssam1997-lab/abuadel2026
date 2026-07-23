import { type ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
};

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
};

// Global stacking counter for proper z-index layering
let modalStack = 0;

export default function Modal({ open, onClose, title, children, size = 'md' }: Props) {
  const [zIndex, setZIndex] = useState(50);

  useEffect(() => {
    if (open) {
      modalStack += 10;
      const z = 50 + modalStack;
      setZIndex(z);
      document.body.style.overflow = 'hidden';
      return () => {
        modalStack = Math.max(0, modalStack - 10);
        if (modalStack === 0) document.body.style.overflow = '';
      };
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6" style={{ zIndex }}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade" onClick={onClose} />
      <div className={`relative card w-full ${sizes[size]} max-h-[92vh] flex flex-col animate-scale`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">
              <X size={20} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
