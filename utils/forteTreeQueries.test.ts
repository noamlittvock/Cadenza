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

  test('filters implemented features by domain and status', () => {
    const implementedFinance = queryForteTree({ domain: 'finance', status: 'implemented' });

    expect(implementedFinance.map(node => node.id)).toContain('payments-charges');
    expect(implementedFinance.every(node => node.domain === 'finance')).toBe(true);
  });

  test('summarizes coverage without losing nodes', () => {
    const coverage = summarizeForteCoverage();

    expect(coverage.total).toBe(FORTE_FEATURE_TREE.length);
    expect(Object.values(coverage.byStatus).reduce((sum, count) => sum + count, 0)).toBe(FORTE_FEATURE_TREE.length);
    expect(coverage.nativeOrEmbedded).toBeGreaterThan(0);
    expect(coverage.p0Gaps).toBe(0);
  });

  test('returns no p0 industry gaps after p0 packet promotion', () => {
    const p0Gaps = getForteIndustryGaps('p0');

    expect(p0Gaps).toEqual([]);
  });

  test('builds embedding records with source metadata and deterministic query names', () => {
    const records = buildForteEmbeddingRecords();
    const agentRecord = records.find(record => record.id === 'deterministic-agent-layer');

    expect(records).toHaveLength(FORTE_FEATURE_TREE.length);
    expect(agentRecord?.text).toContain('Deterministic queries');
    expect(agentRecord?.metadata.deterministicQueries).toContain('queryForteTree');
  });
});
