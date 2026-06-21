import { describe, expect, it } from 'vitest';
import type { ReportDefinition } from '../types/blueprint';
import {
  buildReportDefinitionFromBuilder,
  buildReportLibraryRows,
  buildReportSourceRows,
  filterReportLibraryRows,
} from './ReportsWorkspace';

const NOW = '2026-06-19T12:00:00.000Z';

const reportDefinition = (overrides: Partial<ReportDefinition> = {}): ReportDefinition => ({
  id: 'report_1',
  orgId: 'org_1',
  name: 'Open charge report',
  description: 'Open balances by family',
  sourceEntity: 'charges',
  filters: [],
  groupBy: 'status',
  aggregate: { fn: 'sum', field: 'amount' },
  columns: ['id', 'status', 'amount'],
  isPinned: false,
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'admin_1',
  updatedBy: 'admin_1',
  ...overrides,
});

describe('ReportsWorkspace library helpers', () => {
  it('sorts pinned reports first, then by updated date and name', () => {
    const rows = buildReportLibraryRows([
      reportDefinition({ id: 'older', name: 'B older', updatedAt: '2026-06-01T00:00:00.000Z' }),
      reportDefinition({ id: 'pinned', name: 'Pinned', isPinned: true, updatedAt: '2026-05-01T00:00:00.000Z' }),
      reportDefinition({ id: 'newer', name: 'A newer', updatedAt: '2026-06-18T00:00:00.000Z' }),
    ], 'admin');

    expect(rows.map(row => row.definition.id)).toEqual(['pinned', 'newer', 'older']);
    expect(rows[0].status).toBe('PINNED');
  });

  it('filters by query, source, pinned status, ready status, and blocked markers', () => {
    const rows = buildReportLibraryRows([
      reportDefinition({ id: 'charges', name: 'Open charges', sourceEntity: 'charges' }),
      reportDefinition({ id: 'payments', name: 'Card payments', sourceEntity: 'payments', isPinned: true }),
      reportDefinition({ id: 'blocked', name: 'Consent revocation', sourceEntity: 'agreementAcceptances' as ReportDefinition['sourceEntity'] }),
    ], 'admin');

    expect(filterReportLibraryRows(rows, { query: 'card', source: 'all', status: 'all' }).map(row => row.definition.id))
      .toEqual(['payments']);
    expect(filterReportLibraryRows(rows, { query: '', source: 'charges', status: 'all' }).map(row => row.definition.id))
      .toEqual(['charges']);
    expect(filterReportLibraryRows(rows, { query: '', source: 'all', status: 'pinned' }).map(row => row.definition.id))
      .toEqual(['payments']);
    expect(filterReportLibraryRows(rows, { query: '', source: 'all', status: 'ready' }).map(row => row.definition.id))
      .toEqual(['charges']);
    expect(filterReportLibraryRows(rows, { query: '', source: 'all', status: 'blocked' }).map(row => row.definition.id))
      .toEqual(['blocked']);
  });

  it('limits finance library rows to D-08 authorized report sources', () => {
    const rows = buildReportLibraryRows([
      reportDefinition({ id: 'student', name: 'Student roster', sourceEntity: 'students' }),
      reportDefinition({ id: 'charges', name: 'Open charges', sourceEntity: 'charges' }),
      reportDefinition({ id: 'hours', name: 'Approved payroll', sourceEntity: 'hoursEntries' }),
      reportDefinition({ id: 'attendance', name: 'Attendance', sourceEntity: 'lessonRecords' }),
    ], 'finance');

    expect(rows.map(row => row.definition.id).sort()).toEqual(['charges', 'hours']);
    expect(rows.every(row => row.access.allowed)).toBe(true);
  });

  it('serializes builder drafts into auditable report definitions', () => {
    const previous = reportDefinition({ id: 'existing', createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'admin_original' });
    const next = buildReportDefinitionFromBuilder({
      id: 'existing',
      name: ' Updated charges ',
      description: ' ',
      sourceEntity: 'charges',
      columns: ['id', 'amount'],
      filters: [{ field: 'status', op: 'neq', value: 'VOID' }],
      groupBy: 'status',
      aggregateFn: 'sum',
      aggregateField: 'amount',
      isPinned: true,
    }, {
      orgId: 'org_1',
      actorId: 'admin_2',
      now: NOW,
      previous,
    });

    expect(next).toMatchObject({
      id: 'existing',
      orgId: 'org_1',
      name: 'Updated charges',
      description: null,
      sourceEntity: 'charges',
      columns: ['id', 'amount'],
      groupBy: 'status',
      aggregate: { fn: 'sum', field: 'amount' },
      isPinned: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'admin_original',
      updatedAt: NOW,
      updatedBy: 'admin_2',
    });
  });

  it('normalizes source rows to report allowlist fields and student family lineage', () => {
    const rows = buildReportSourceRows({
      events: [{ id: 'event_1', name: 'Piano', start: '2026-06-19T10:00:00.000Z', end: '2026-06-19T11:30:00.000Z', activityId: 'act_1', roomId: 'room_1' }],
      students: [{ id: 'student_1', fullName: 'Dana Cohen', profileStatus: 'ARCHIVED' }],
      studentFamilyIds: { student_1: 'family_1' },
      charges: [{ id: 'charge_1', amount: 500, status: 'OPEN' }],
    });

    expect(rows.events?.[0]).toEqual({
      id: 'event_1',
      name: 'Piano',
      date: '2026-06-19',
      durationMinutes: 90,
      activityId: 'act_1',
      roomId: 'room_1',
    });
    expect(rows.students?.[0]).toEqual({
      id: 'student_1',
      fullName: 'Dana Cohen',
      familyId: 'family_1',
      isArchived: true,
    });
    expect(rows.charges?.[0]).toMatchObject({ id: 'charge_1', amount: 500 });
  });
});
