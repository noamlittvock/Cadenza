import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { CalendarFilterState, DEFAULT_FILTER_STATE, isFilterActive } from '../types/calendarFilters';
import { serializeFilters, parseFilters, fromParsedObject } from '../utils/calendarFilterUrl';

const LS_KEY = 'cadenza.calendar.filters';

function hydrateInitialState(orgId: string): CalendarFilterState {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('calFilter');
    if (raw) return parseFilters(raw);
  } catch { /* ignore */ }

  try {
    const stored = localStorage.getItem(`${LS_KEY}.${orgId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return fromParsedObject(parsed);
      }
    }
  } catch { /* ignore — fall through to defaults */ }

  return { ...DEFAULT_FILTER_STATE };
}

export function useCalendarFilters(orgId: string) {
  const [state, setStateRaw] = useState<CalendarFilterState>(() => hydrateInitialState(orgId));
  const lastSerializedRef = useRef<string | null>(null);

  // Sync to URL + localStorage on every state change. Skip writes when the serialized
  // form hasn't changed — avoids history-spam on hydration round-trip and noop updates.
  useEffect(() => {
    const serialized = serializeFilters(state);
    if (serialized !== lastSerializedRef.current) {
      lastSerializedRef.current = serialized;
      try {
        const url = new URL(window.location.href);
        if (serialized) url.searchParams.set('calFilter', serialized);
        else url.searchParams.delete('calFilter');
        window.history.replaceState(null, '', url.toString());
      } catch { /* non-browser env */ }
    }

    try {
      localStorage.setItem(`${LS_KEY}.${orgId}`, JSON.stringify(state));
    } catch { /* storage quota */ }
  }, [state, orgId]);

  const set = useCallback((partial: Partial<CalendarFilterState>) => {
    setStateRaw(prev => ({ ...prev, ...partial }));
  }, []);

  const clear = useCallback(() => {
    setStateRaw({ ...DEFAULT_FILTER_STATE });
  }, []);

  const isActive = useMemo(() => isFilterActive(state), [state]);

  return { state, set, clear, isActive };
}
