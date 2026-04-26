import { useState, useCallback } from 'react';

type ListStyle = 'grid' | 'list' | 'table';
const STORAGE_KEY = 'cadenza_list_style';

export function useListStyle(supportedStyles: ListStyle[] = ['grid', 'list', 'table']): [ListStyle, (style: ListStyle) => void] {
  const [style, setStyleState] = useState<ListStyle>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ListStyle | null;
      if (stored && supportedStyles.includes(stored)) return stored;
      if (stored === 'table' && !supportedStyles.includes('table')) return 'list';
      return 'list';
    } catch { return 'list'; }
  });

  const setStyle = useCallback((s: ListStyle) => {
    setStyleState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch { /* noop */ }
  }, []);

  return [style, setStyle];
}
