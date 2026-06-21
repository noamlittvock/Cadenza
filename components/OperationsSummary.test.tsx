import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AdminInboxItem, AppSettings, CalendarEvent } from '../types';
import type { HoursEntry, ReportDefinition } from '../types/blueprint';
import type { ImportSession } from '../types/v2';
import { OperationsSummary, getOperationsSummaryCounts } from './OperationsSummary';
import { buildOperationsSnapshot } from '../utils/blueprintQueries';

const NOW = '2026-06-19T09:00:00.000Z';

const settings: AppSettings = {
  language: 'en-US',
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '24h',
  timeZone: 'UTC',
  defaultEventDuration: 60,
  weekNumberDisplay: 'none',
  developerMode: false,
};

const event = (id: string, start: string, end: string): CalendarEvent => ({
  id,
  name: id,
  start,
  end,
  roomId: 'room_1',
  isHidden: false,
  isCanceled: false,
} as CalendarEvent);

const base = { orgId: 'org_1', createdAt: NOW, updatedAt: NOW };

describe('OperationsSummary', () => {
  it('renders settled admin cards and provisional blocked states from the snapshot model', () => {
    const markup = renderToStaticMarkup(
      <OperationsSummary
        settings={settings}
        orgId="org_1"
        actor="admin"
        canAccessOperations={true}
        events={[
          event('conflict_a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
          event('conflict_b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
        ]}
        inboxItems={[{ id: 'inbox_1', orgId: 'org_1', type: 'NOTIFICATION', status: 'OPEN', title: 'Open', message: 'Open item', createdAt: NOW }]}
        hoursEntries={[{ ...base, id: 'hours_1', staffMemberId: 'staff_1', hoursReportId: null, date: '2026-06-19', reportedMinutes: 60, calendarMinutes: 60, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'SUBMITTED', note: null } as HoursEntry]}
        reportDefinitions={[{ ...base, id: 'report_1', name: 'Charges', description: null, sourceEntity: 'charges', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: false } as ReportDefinition]}
        importSessions={[{ id: 'import_1', orgId: 'org_1', createdBy: 'admin', entityType: 'STUDENT', status: 'COMPLETED_WITH_ERRORS', fileName: 'students.csv', totalRows: 3, importedRows: 1, skippedRows: 1, rowResults: [], createdAt: { seconds: 1_718_780_400, nanoseconds: 0 }, updatedAt: { seconds: 1_718_780_500, nanoseconds: 0 } } as ImportSession]}
      />,
    );

    expect(markup).toContain('data-testid="operations-summary"');
    expect(markup).toContain('Open room conflicts');
    expect(markup).toContain('Import health');
    expect(markup).toContain('Report health');
    expect(markup).toContain('Open Calendar');
    expect(markup).toContain('data-testid="operations-open-reportHealth"');
    expect(markup).toContain('Consent revocation');
    expect(markup).toContain('D-24');
  });

  it('renders finance-limited cards without non-finance source leakage', () => {
    const markup = renderToStaticMarkup(
      <OperationsSummary
        settings={settings}
        orgId="org_1"
        actor="finance"
        canAccessOperations={true}
        events={[
          event('conflict_a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
          event('conflict_b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
        ]}
        inboxItems={[{ id: 'inbox_sensitive', orgId: 'org_1', type: 'APPROVAL_REQUEST', status: 'OPEN', title: 'Sensitive', message: 'Hidden', createdAt: NOW }]}
        hoursEntries={[{ ...base, id: 'hours_1', staffMemberId: 'staff_1', hoursReportId: null, date: '2026-06-19', reportedMinutes: 60, calendarMinutes: 60, eventId: null, teachingAssignmentId: null, orgRoleId: null, rate: null, status: 'SUBMITTED', note: null } as HoursEntry]}
        reportDefinitions={[
          { ...base, id: 'report_charge', name: 'Charges', description: null, sourceEntity: 'charges', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: false } as ReportDefinition,
          { ...base, id: 'report_student', name: 'Students', description: null, sourceEntity: 'students', filters: [], groupBy: null, aggregate: { fn: 'none', field: null }, columns: ['id'], isPinned: false } as ReportDefinition,
        ]}
        importSessions={[]}
      />,
    );

    expect(markup).toContain('Finance scope');
    expect(markup).toContain('Pending hours');
    expect(markup).toContain('Report health');
    expect(markup).toContain('Open Payroll');
    expect(markup).not.toContain('Open room conflicts');
    expect(markup).not.toContain('inbox_sensitive');
    expect(markup).not.toContain('conflict_a');
    expect(markup).not.toContain('report_student');
  });

  it('renders stale source and permission failure states without leaking denied source details', () => {
    const staleMarkup = renderToStaticMarkup(
      <OperationsSummary
        settings={settings}
        orgId="org_1"
        actor="admin"
        canAccessOperations={true}
        events={[
          event('conflict_a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z'),
          event('conflict_b', '2026-06-19T09:30:00.000Z', '2026-06-19T10:30:00.000Z'),
        ]}
        inboxItems={[]}
        hoursEntries={[]}
        reportDefinitions={[]}
        importSessions={[]}
        existingSourceIds={{ openConflicts: ['conflict_a'] }}
      />,
    );

    expect(staleMarkup).toContain('Source changed');
    expect(staleMarkup).toContain('1 stale source reference(s)');
    expect(staleMarkup).toContain('! conflict_b');

    const deniedMarkup = renderToStaticMarkup(
      <OperationsSummary
        settings={settings}
        orgId="org_1"
        actor="member"
        canAccessOperations={false}
        events={[event('conflict_secret', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z')]}
        inboxItems={[{ id: 'inbox_secret', orgId: 'org_1', type: 'APPROVAL_REQUEST', status: 'OPEN', title: 'Sensitive', message: 'Hidden', createdAt: NOW }]}
        hoursEntries={[]}
        reportDefinitions={[]}
        importSessions={[]}
      />,
    );

    expect(deniedMarkup).toContain('Operations summary is restricted');
    expect(deniedMarkup).not.toContain('conflict_secret');
    expect(deniedMarkup).not.toContain('inbox_secret');
    expect(deniedMarkup).not.toContain('1 stale source reference');
  });

  it('renders a denied state without source counts for non-operator actors', () => {
    const markup = renderToStaticMarkup(
      <OperationsSummary
        settings={settings}
        orgId="org_1"
        actor="member"
        canAccessOperations={false}
        events={[event('conflict_a', '2026-06-19T09:00:00.000Z', '2026-06-19T10:00:00.000Z')]}
        inboxItems={[{ id: 'inbox_sensitive', orgId: 'org_1', type: 'APPROVAL_REQUEST', status: 'OPEN', title: 'Sensitive', message: 'Hidden', createdAt: NOW }]}
        hoursEntries={[]}
        reportDefinitions={[]}
        importSessions={[]}
      />,
    );

    expect(markup).toContain('data-testid="operations-summary-denied"');
    expect(markup).toContain('Operations summary is restricted');
    expect(markup).not.toContain('inbox_sensitive');
    expect(markup).not.toContain('conflict_a');
  });

  it('summarizes card state counts for compact headers', () => {
    const snapshot = buildOperationsSnapshot({}, {
      orgId: 'org_1',
      actor: 'admin',
      generatedAt: NOW,
      date: '2026-06-19',
      timeZone: 'UTC',
    });

    expect(getOperationsSummaryCounts(snapshot.cards)).toMatchObject({
      empty: 6,
      blocked: 7,
      ready: 0,
      denied: 0,
    });
  });
});
