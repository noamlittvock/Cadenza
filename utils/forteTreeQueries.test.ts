import { describe, expect, test } from 'vitest';
import {
  buildForteEmbeddingRecords,
  getForteFeatureById,
  getForteIndustryGaps,
  queryForteTree,
  summarizeForteCoverage,
} from './forteTreeQueries';
import { FORTE_FEATURE_TREE } from '../features/forteTree';

describe('forteTreeQueries', () => {
  test('finds features by stable ID', () => {
    const feature = getForteFeatureById('calendar-schedule-engine');

    expect(feature?.status).toBe('native');
    expect(feature?.dataEntities).toContain('CalendarEvent');
  });

  test('filters gaps by domain and priority', () => {
    const financeGaps = queryForteTree({ domain: 'finance', status: 'gap' });

    expect(financeGaps.map(node => node.id)).toContain('payments-charges');
    expect(financeGaps.every(node => node.domain === 'finance')).toBe(true);
  });

  test('summarizes coverage without losing nodes', () => {
    const coverage = summarizeForteCoverage();

    expect(coverage.total).toBe(FORTE_FEATURE_TREE.length);
    expect(Object.values(coverage.byStatus).reduce((sum, count) => sum + count, 0)).toBe(FORTE_FEATURE_TREE.length);
    expect(coverage.nativeOrEmbedded).toBeGreaterThan(0);
    expect(coverage.p0Gaps).toBeGreaterThan(0);
  });

  test('returns industry gaps at or above the requested priority', () => {
    const p0Gaps = getForteIndustryGaps('p0');

    expect(p0Gaps.every(node => node.priority === 'p0')).toBe(true);
    expect(p0Gaps.some(node => node.id === 'lesson-details-attendance')).toBe(true);
  });

  test('builds embedding records with source metadata and deterministic query names', () => {
    const records = buildForteEmbeddingRecords();
    const agentRecord = records.find(record => record.id === 'deterministic-agent-layer');

    expect(records).toHaveLength(FORTE_FEATURE_TREE.length);
    expect(agentRecord?.text).toContain('Deterministic queries');
    expect(agentRecord?.metadata.deterministicQueries).toContain('queryForteTree');
  });
});
