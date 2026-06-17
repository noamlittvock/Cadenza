import React, { useEffect } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

export interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  width?: string;
}

export const SlideOver: React.FC<SlideOverProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 'w-[360px]',
}) => {
  const t = (key: string): string => {
    const lang = document.documentElement.lang || 'en-US';
    return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en-US']?.[key] || key;
  };

  // Escape key closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`${width} max-md:fixed max-md:inset-0 max-md:z-[201] shrink-0 flex flex-col bg-white dark:bg-slate-900 border-l rtl:border-l-0 rtl:border-r border-slate-200 dark:border-slate-800 h-full overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {/* Mobile back arrow */}
        <button
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 mr-2 rtl:mr-0 rtl:ml-2"
          aria-label={t('btn.back')}
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex-1 min-w-0">
          {title && typeof title === 'string' ? (
            <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{title}</h2>
          ) : (
            title ?? <div />
          )}
        </div>

        {/* Desktop close button */}
        <button
          onClick={onClose}
          className="hidden md:flex p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-2 rtl:ml-0 rtl:mr-2"
          aria-label={t('common.close')}
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {children}
      </div>
    </div>
  );
};
