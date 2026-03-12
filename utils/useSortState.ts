import { useState, useCallback } from 'react';

type SortDirection = 'asc' | 'desc';

export function useSortState<K extends string>(defaultKey: K, defaultDir: SortDirection = 'asc') {
  const [sort, setSort] = useState<{ key: K; direction: SortDirection }>({ key: defaultKey, direction: defaultDir });

  const toggleSort = useCallback((key: K) => {
    setSort(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' }
    );
  }, []);

  return { sortKey: sort.key, sortDirection: sort.direction, toggleSort };
}
