import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../utils/firebase';
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
        const q = query(collection(db, 'translations'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const dict: Record<string, string> = {};
            snapshot.forEach((doc) => {
                const data = doc.data() as TranslationRecord;
                if (data.status !== 'untranslated' && data.he_IL) {
                    // The doc ID should be the key
                    dict[data.key || doc.id] = data.he_IL;
                }
            });
            setLiveTranslations(dict);
            setLoading(false);
        }, (error) => {
            console.error("Translation sync error", error);
            setLoading(false);
        });

        return () => unsubscribe();
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
