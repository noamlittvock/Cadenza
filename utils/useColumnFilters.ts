import { useState, useMemo, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ColumnFilterConfig<T> {
  key: string;
  type: 'text' | 'checkbox';
  label: string;
  getValue: (item: T) => string | string[];
}

export interface ColumnFilterState {
  /** For checkbox filters: selected values */
  selected: Set<string>;
  /** For text filters: search substring */
  text: string;
}

export interface UseColumnFiltersResult<T> {
  filters: Record<string, ColumnFilterState>;
  setCheckboxFilter: (key: string, values: Set<string>) => void;
  setTextFilter: (key: string, text: string) => void;
  clearFilter: (key: string) => void;
  clearAll: () => void;
  hasActiveFilters: boolean;
  filteredData: T[];
  distinctValues: Record<string, string[]>;
  activeFilterSummary: { key: string; label: string; type: 'text' | 'checkbox'; display: string }[];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useColumnFilters<T>(
  data: T[],
  columns: ColumnFilterConfig<T>[],
): UseColumnFiltersResult<T> {
  const [filters, setFilters] = useState<Record<string, ColumnFilterState>>({});

  // Distinct values per checkbox column, sorted alphabetically
  const distinctValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const col of columns) {
      if (col.type !== 'checkbox') continue;
      const valSet = new Set<string>();
      for (const item of data) {
        const raw = col.getValue(item);
        const vals = Array.isArray(raw) ? raw : [raw];
        for (const v of vals) {
          if (v) valSet.add(v);
        }
      }
      result[col.key] = [...valSet].sort((a, b) => a.localeCompare(b));
    }
    return result;
  }, [data, columns]);

  // Apply all active filters
  const filteredData = useMemo(() => {
    let result = data;
    for (const col of columns) {
      const f = filters[col.key];
      if (!f) continue;

      if (col.type === 'checkbox' && f.selected.size > 0) {
        result = result.filter(item => {
          const raw = col.getValue(item);
          const vals = Array.isArray(raw) ? raw : [raw];
          return vals.some(v => f.selected.has(v));
        });
      } else if (col.type === 'text' && f.text.trim()) {
        const q = f.text.toLowerCase();
        result = result.filter(item => {
          const raw = col.getValue(item);
          const vals = Array.isArray(raw) ? raw : [raw];
          return vals.some(v => v.toLowerCase().includes(q));
        });
      }
    }
    return result;
  }, [data, columns, filters]);

  const setCheckboxFilter = useCallback((key: string, values: Set<string>) => {
    setFilters(prev => ({
      ...prev,
      [key]: { selected: values, text: prev[key]?.text ?? '' },
    }));
  }, []);

  const setTextFilter = useCallback((key: string, text: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: { selected: prev[key]?.selected ?? new Set(), text },
    }));
  }, []);

  const clearFilter = useCallback((key: string) => {
    setFilters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setFilters({}), []);

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(
      (f: ColumnFilterState) => f.selected.size > 0 || f.text.trim().length > 0,
    );
  }, [filters]);

  // Summary for pills display
  const activeFilterSummary = useMemo(() => {
    const summary: { key: string; label: string; type: 'text' | 'checkbox'; display: string }[] = [];
    for (const col of columns) {
      const f = filters[col.key];
      if (!f) continue;
      if (col.type === 'checkbox' && f.selected.size > 0) {
        const display = f.selected.size === 1
          ? [...f.selected][0]
          : `${f.selected.size} selected`;
        summary.push({ key: col.key, label: col.label, type: 'checkbox', display });
      } else if (col.type === 'text' && f.text.trim()) {
        summary.push({ key: col.key, label: col.label, type: 'text', display: `"${f.text.trim()}"` });
      }
    }
    return summary;
  }, [columns, filters]);

  return {
    filters,
    setCheckboxFilter,
    setTextFilter,
    clearFilter,
    clearAll,
    hasActiveFilters,
    filteredData,
    distinctValues,
    activeFilterSummary,
  };
}
