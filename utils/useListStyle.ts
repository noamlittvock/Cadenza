import { useState, useCallback } from 'react';

type ListStyle = 'grid' | 'list' | 'table' | 'tree';
const STORAGE_KEY = 'cadenza_list_style';

export function useListStyle(supportedStyles: ListStyle[] = ['grid', 'list', 'table']): [ListStyle, (style: ListStyle) => void] {
  const [style, setStyleState] = useState<ListStyle>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ListStyle | null;
      if (stored && supportedStyles.includes(stored)) return stored;
      if (stored === 'table' && !supportedStyles.includes('table')) return 'list';
      return supportedStyles[0] ?? 'list';
    } catch { return supportedStyles[0] ?? 'list'; }
  });

  const setStyle = useCallback((s: ListStyle) => {
    setStyleState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch { /* noop */ }
  }, []);

  return [style, setStyle];
}
