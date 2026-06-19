import { describe, expect, it } from 'vitest';
import { diffCollectionWriteSet } from './useSupabaseSync';

type SyncRow = {
  id: string;
  orgId: string;
  value: string;
  nested?: { count: number };
};

describe('diffCollectionWriteSet', () => {
  it('upserts only new and changed rows', () => {
    const unchanged: SyncRow = { id: 'same', orgId: 'org_1', value: 'unchanged' };
    const changedBefore: SyncRow = { id: 'changed', orgId: 'org_1', value: 'before' };
    const changedAfter: SyncRow = { ...changedBefore, value: 'after' };
    const created: SyncRow = { id: 'new', orgId: 'org_1', value: 'created' };

    const result = diffCollectionWriteSet([unchanged, changedBefore], [unchanged, changedAfter, created]);

    expect(result.changedItems).toEqual([changedAfter, created]);
    expect(result.deletedIds).toEqual([]);
  });

  it('returns deleted ids for rows removed from the subscribed snapshot', () => {
    const kept: SyncRow = { id: 'kept', orgId: 'org_1', value: 'kept' };
    const removed: SyncRow = { id: 'removed', orgId: 'org_1', value: 'removed' };

    const result = diffCollectionWriteSet([kept, removed], [kept]);

    expect(result.changedItems).toEqual([]);
    expect(result.deletedIds).toEqual(['removed']);
  });

  it('does not write when the collection is unchanged', () => {
    const rows: SyncRow[] = [
      { id: 'one', orgId: 'org_1', value: 'same', nested: { count: 1 } },
      { id: 'two', orgId: 'org_1', value: 'same' },
    ];

    const result = diffCollectionWriteSet(rows, rows.map(row => ({ ...row })));

    expect(result).toEqual({ changedItems: [], deletedIds: [] });
  });
});
