import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSupabase } from '../utils/supabaseClient';
import { TranslationRecord } from '../types/translations';

interface TranslationContextType {
    liveTranslations: Record<string, string>;
    loading: boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [liveTranslations, setLiveTranslations] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const sb = getSupabase();
        if (!sb) {
            setLoading(false);
            return;
        }

        const load = async () => {
            const { data, error } = await sb.from('translations').select('*');
            if (error) {
                console.error("Translation sync error", error);
                setLoading(false);
                return;
            }
            const dict: Record<string, string> = {};
            (data ?? []).forEach((row: any) => {
                const record = {
                    ...row,
                    he_IL: row.he_il,
                    original_english: row.original_english,
                } as TranslationRecord;
                if (record.status !== 'untranslated' && record.he_IL) {
                    dict[record.key || row.id] = record.he_IL;
                }
            });
            setLiveTranslations(dict);
            setLoading(false);
        };
        void load();

        const channel = sb
            .channel('translations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'translations' }, () => { void load(); })
            .subscribe();

        return () => { void sb.removeChannel(channel); };
    }, []);

    return (
        <TranslationContext.Provider value={{ liveTranslations, loading }}>
            {children}
        </TranslationContext.Provider>
    );
};

export const useTranslation = () => {
    const context = useContext(TranslationContext);
    if (context === undefined) {
        throw new Error('useTranslation must be used within a TranslationProvider');
    }
    return context;
};
