import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string | React.ReactNode;
    children: React.ReactNode;
    isDirty?: boolean;
    onSave?: () => void | boolean | Promise<void | boolean>; // If provided, "Save" triggers this. Return false to prevent closing.
    footerContent?: React.ReactNode; // Optional footer content to render inside the modal
    maxWidth?: string; // e.g. "max-w-2xl", "max-w-4xl"
    className?: string; // additional container classes
    hideHeader?: boolean;
    anchorPosition?: { x: number; y: number } | null; // Position modal near this point instead of centered
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    isDirty = false,
    onSave,
    footerContent,
    maxWidth = 'max-w-2xl',
    className = '',
    hideHeader = false,
    anchorPosition = null,
}) => {
    const t = (key: string): string => {
        const lang = document.documentElement.lang || 'en-US';
        return (TRANSLATIONS as any)[lang]?.[key] || (TRANSLATIONS as any)['en-US']?.[key] || key;
    };
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen && !showConfirm) {
                handleCloseRequest();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, showConfirm, isDirty]);

    // Compute anchor-based positioning (wide screens only)
    const anchorStyle = React.useMemo<React.CSSProperties | undefined>(() => {
        if (!anchorPosition || typeof window === 'undefined' || window.innerWidth < 768) return undefined;
        const margin = 16;
        const modalWidth = 672; // max-w-2xl ≈ 42rem ≈ 672px
        const modalMaxHeight = window.innerHeight * 0.9;
        // Position: try to place modal so anchor is near the top-left area
        let left = anchorPosition.x - modalWidth / 2;
        let top = anchorPosition.y - 40; // slightly above the click
        // Clamp to viewport
        left = Math.max(margin, Math.min(left, window.innerWidth - modalWidth - margin));
        top = Math.max(margin, Math.min(top, window.innerHeight - modalMaxHeight - margin));
        return { position: 'fixed' as const, top, left, width: modalWidth, maxWidth: '100%' };
    }, [anchorPosition]);

    if (!isOpen) return null;

    const handleCloseRequest = () => {
        if (isDirty) {
            setShowConfirm(true);
        } else {
            onClose();
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleCloseRequest();
        }
    };

    const handleDiscard = () => {
        setShowConfirm(false);
        onClose();
    };

    const handleSave = async () => {
        if (onSave) {
            const result = await onSave();
            if (result === false) {
                setShowConfirm(false);
                return; // Validation failed — don't close
            }
        }
        setShowConfirm(false);
        onClose();
    };

    return (
        <div
            className={`fixed inset-0 bg-black/50 z-[200] p-4 transition-opacity duration-200 ${anchorStyle ? '' : 'flex items-center justify-center'}`}
            onClick={handleBackdropClick}
        >
            <div
                className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] relative ${anchorStyle ? '' : `w-full ${maxWidth}`} ${className}`}
                style={anchorStyle}
            >

                {!hideHeader && (
                    <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800">
                        {title && typeof title === 'string' ? (
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h3>
                        ) : (
                            title ? title : <div />
                        )}
                        <button
                            onClick={handleCloseRequest}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1"
                            aria-label={t('common.close') || 'Close'}
                        >
                            <X size={24} />
                        </button>
                    </div>
                )}

                {hideHeader && (
                    <button
                        onClick={handleCloseRequest}
                        className="absolute top-4 right-4 rtl:left-4 rtl:right-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors bg-white/50 dark:bg-slate-900/50 rounded-full p-1 z-10"
                        aria-label={t('common.close') || 'Close'}
                    >
                        <X size={24} />
                    </button>
                )}

                <div className="flex-1 overflow-y-auto p-6">
                    {children}
                </div>
                {footerContent && (
                    <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-xl flex justify-between items-center shrink-0">
                        {footerContent}
                    </div>
                )}
            </div>

            {showConfirm && (
                <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 mb-4">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold">{t('modal_unsaved_changes') || 'Unsaved Changes'}</h3>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300 mb-6 font-medium">
                            {t('modal_discard_prompt') || 'You have unsaved changes. Would you like to save or discard them?'}
                        </p>
                        <div className="flex justify-end gap-3 font-semibold text-sm">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                            >
                                {t('common.cancel') || 'Cancel'}
                            </button>
                            <button
                                onClick={handleDiscard}
                                className="px-4 py-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                            >
                                {t('common_discard') || 'Discard'}
                            </button>
                            {onSave && (
                                <button
                                    onClick={handleSave}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                >
                                    {t('common.save') || 'Save'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
