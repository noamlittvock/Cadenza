export interface TranslationRecord {
    id: string; // The translation key (e.g., 'auth.login_btn')
    key: string;
    original_english: string;
    screen_group: string;
    status: 'untranslated' | 'auto_translated' | 'reviewed' | 'overridden';
    he_IL: string;
    auto_translated_he_IL: string;
    manual_override: boolean;
    last_updated: string;
}

export interface ExtractedString {
    key: string;
    original_english: string;
    screen_group: string;
}
