import React, { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string | React.ReactNode;
    children: React.ReactNode;
    isDirty?: boolean;
    onSave?: () => void; // If provided, "Save" triggers this and then closes.
    footerContent?: React.ReactNode; // Optional footer content to render inside the modal
    maxWidth?: string; // e.g. "max-w-2xl", "max-w-4xl"
    className?: string; // additional container classes
    hideHeader?: boolean;
    t?: (key: string) => string;
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
    t = (key: string) => key,
}) => {
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

    const handleSave = () => {
        if (onSave) {
            onSave();
        }
        setShowConfirm(false);
        // Note: If onSave handles closing internally, we might not need onClose() here.
        // However, for consistency, we call onClose(). Ensure onSave is synchronous or doesn't break if dialog unmounts.
        onClose();
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4 transition-opacity duration-200"
            onClick={handleBackdropClick}
        >
            <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] relative ${maxWidth} ${className}`}>

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
                                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
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
