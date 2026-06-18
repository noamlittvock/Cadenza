import { describe, it, expect } from 'vitest';
import {
  rowToApp,
  appToRow,
  tableSpecFor,
  COLLECTION_TO_TABLE,
  type TableSpec,
} from './supabaseSync';

const HYBRID: TableSpec = { table: 'events', mode: 'HYBRID' };
const NORMALIZED: TableSpec = { table: 'charges', mode: 'NORMALIZED' };

describe('tableSpecFor', () => {
  it('resolves known core collections to HYBRID tables', () => {
    expect(tableSpecFor('events')).toEqual({ table: 'events', mode: 'HYBRID' });
    expect(tableSpecFor('ganttBlocks')).toEqual({ table: 'gantt_blocks', mode: 'HYBRID' });
  });

  it('resolves known blueprint collections to NORMALIZED tables', () => {
    expect(tableSpecFor('registrationIntake')).toEqual({ table: 'registration_intake', mode: 'NORMALIZED' });
    expect(tableSpecFor('charges')).toEqual({ table: 'charges', mode: 'NORMALIZED' });
    expect(tableSpecFor('rolloverRuns')).toEqual({ table: 'rollover_runs', mode: 'NORMALIZED' });
    expect(tableSpecFor('publicEndpoints')).toEqual({ table: 'public_endpoints', mode: 'NORMALIZED' });
  });

  it('falls back to a HYBRID table named after an unknown collection', () => {
    expect(tableSpecFor('somethingNew')).toEqual({ table: 'somethingNew', mode: 'HYBRID' });
  });
});

describe('HYBRID mapping (jsonb document under `data`)', () => {
  it('rowToApp unwraps `data` and surfaces id + orgId', () => {
    const row = { id: 'e1', org_id: 'org1', data: { name: 'Recital', startTime: '09:00', tagIds: ['a'] } };
    expect(rowToApp(HYBRID, row)).toEqual({
      id: 'e1',
      orgId: 'org1',
      name: 'Recital',
      startTime: '09:00',
      tagIds: ['a'],
    });
  });

  it('rowToApp tolerates a missing `data` column', () => {
    expect(rowToApp(HYBRID, { id: 'e1', org_id: 'org1' })).toEqual({ id: 'e1', orgId: 'org1' });
  });

  it('appToRow nests the whole document under `data`, sets org_id, drops top-level orgId', () => {
    const item = { id: 'e1', orgId: 'ignored', name: 'Recital', startTime: '09:00' };
    expect(appToRow(HYBRID, 'org1', item)).toEqual({
      id: 'e1',
      org_id: 'org1',
      data: { name: 'Recital', startTime: '09:00' },
    });
  });

  it('does NOT case-convert document keys (camelCase preserved inside `data`)', () => {
    const row = { id: 'e1', org_id: 'org1', data: { start_time_local: 1, mixedCaseKey: 2 } };
    const app = rowToApp(HYBRID, row);
    expect(app.start_time_local).toBe(1);
    expect(app.mixedCaseKey).toBe(2);
    // …and they survive the write path verbatim.
    expect(appToRow(HYBRID, 'org1', app as Record<string, unknown>).data).toEqual({
      start_time_local: 1,
      mixedCaseKey: 2,
    });
  });

  it('round-trips an app document through write→read', () => {
    const item = { id: 'e1', orgId: 'org1', name: 'Recital', meta: { room: 'A', seats: 40 } };
    const restored = rowToApp(HYBRID, appToRow(HYBRID, 'org1', item) as Record<string, unknown>);
    expect(restored).toEqual(item);
  });
});

describe('Student/Family packet mapping contracts', () => {
  it('maps students as HYBRID rows without converting the legacy Student document', () => {
    const studentSpec = tableSpecFor('students');
    const legacyStudent = {
      id: 'stu_1',
      orgId: 'ignored-client-org',
      fullName: 'Dana Cohen',
      profileStatus: 'ACTIVE',
      currentGrade: 7,
      guardians: [
        { id: 'g1', fullName: 'Ron Cohen', phone: '050-2222222', isPrimary: true },
        { id: 'g2', fullName: 'Mia Cohen', email: 'mia@example.com', isPrimary: false },
      ],
      nestedLegacyKey: { startTime: '09:00', snake_key: 'preserved' },
    };

    const row = appToRow(studentSpec, 'org_1', legacyStudent);
    expect(row).toEqual({
      id: 'stu_1',
      org_id: 'org_1',
      data: {
        fullName: 'Dana Cohen',
        profileStatus: 'ACTIVE',
        currentGrade: 7,
        guardians: [
          { id: 'g1', fullName: 'Ron Cohen', phone: '050-2222222', isPrimary: true },
          { id: 'g2', fullName: 'Mia Cohen', email: 'mia@example.com', isPrimary: false },
        ],
        nestedLegacyKey: { startTime: '09:00', snake_key: 'preserved' },
      },
    });

    expect(rowToApp(studentSpec, row)).toEqual({ ...legacyStudent, orgId: 'org_1' });
  });

  it('maps families as NORMALIZED rows while preserving guardians[] jsonb and student links', () => {
    const familySpec = tableSpecFor('families');
    const family = {
      id: 'fam_1',
      orgId: 'ignored-client-org',
      name: 'Cohen-Levi',
      guardians: [
        {
          id: 'guardian_1',
          fullName: 'Ron Cohen',
          relationship: 'PARENT',
          phone: '050-2222222',
          email: 'ron@example.com',
          isPrimary: true,
        },
        {
          id: 'guardian_2',
          fullName: 'Mia Levi',
          relationship: 'GUARDIAN',
          phone: null,
          email: 'mia@example.com',
          isPrimary: false,
        },
      ],
      studentIds: ['stu_1', 'stu_2'],
      primaryContactGuardianId: 'guardian_1',
      billingNotes: 'Pays annually',
      isArchived: false,
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T11:00:00.000Z',
      createdBy: 'user_admin',
      updatedBy: undefined,
    };

    const row = appToRow(familySpec, 'org_1', family);
    expect(row).toEqual({
      org_id: 'org_1',
      id: 'fam_1',
      name: 'Cohen-Levi',
      guardians: family.guardians,
      student_ids: ['stu_1', 'stu_2'],
      primary_contact_guardian_id: 'guardian_1',
      billing_notes: 'Pays annually',
      is_archived: false,
      created_at: '2026-06-18T10:00:00.000Z',
      updated_at: '2026-06-18T11:00:00.000Z',
      created_by: 'user_admin',
    });
    expect('updated_by' in row).toBe(false);

    expect(rowToApp(familySpec, row)).toEqual({
      id: 'fam_1',
      orgId: 'org_1',
      name: 'Cohen-Levi',
      guardians: family.guardians,
      studentIds: ['stu_1', 'stu_2'],
      primaryContactGuardianId: 'guardian_1',
      billingNotes: 'Pays annually',
      isArchived: false,
      createdAt: '2026-06-18T10:00:00.000Z',
      updatedAt: '2026-06-18T11:00:00.000Z',
      createdBy: 'user_admin',
    });
  });
});

describe('NORMALIZED mapping (real snake_case columns, nested jsonb)', () => {
  it('rowToApp converts top-level columns snake→camel and leaves nested jsonb intact', () => {
    const row = {
      id: 'c1',
      org_id: 'org1',
      family_id: 'f1',
      line_items: [{ unitPrice: 10, taxRate: 0.17 }],
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(rowToApp(NORMALIZED, row)).toEqual({
      id: 'c1',
      orgId: 'org1',
      familyId: 'f1',
      lineItems: [{ unitPrice: 10, taxRate: 0.17 }], // nested keys untouched
      createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('appToRow converts top-level camel→snake, sets org_id, drops orgId and undefined', () => {
    const item = {
      id: 'c1',
      orgId: 'ignored',
      familyId: 'f1',
      lineItems: [{ unitPrice: 10 }],
      note: undefined,
    };
    expect(appToRow(NORMALIZED, 'org1', item)).toEqual({
      org_id: 'org1',
      id: 'c1',
      family_id: 'f1',
      line_items: [{ unitPrice: 10 }], // nested keys untouched
    });
    expect('note' in appToRow(NORMALIZED, 'org1', item)).toBe(false);
  });

  it('round-trips a normalized item through write→read (orgId restored from column)', () => {
    const item = { id: 'c1', orgId: 'org1', familyId: 'f1', amountDue: 250, lineItems: [{ unitPrice: 250 }] };
    const restored = rowToApp(NORMALIZED, appToRow(NORMALIZED, 'org1', item) as Record<string, unknown>);
    expect(restored).toEqual(item);
  });

  it('single-capital keys round-trip cleanly (pdfUrl ↔ pdf_url)', () => {
    const row = appToRow(NORMALIZED, 'org1', { id: 'a1', pdfUrl: 'http://x' });
    expect(row.pdf_url).toBe('http://x');
    expect(rowToApp(NORMALIZED, row).pdfUrl).toBe('http://x');
  });

  it('GUARD: consecutive-capital keys do NOT collapse to a clean snake column', () => {
    // camelToSnake underscores EACH capital, so an acronym key like `pdfURL`
    // maps to `pdf_u_r_l`, not `pdf_url`. It round-trips without data loss, but
    // the column name will not match a hand-written `pdf_url` column. Normalized
    // table fields must therefore avoid consecutive capitals / acronyms.
    const row = appToRow(NORMALIZED, 'org1', { id: 'a1', pdfURL: 'http://x' });
    expect(row.pdf_url).toBeUndefined();
    expect(row.pdf_u_r_l).toBe('http://x');
    expect(rowToApp(NORMALIZED, row).pdfURL).toBe('http://x'); // no data loss on round-trip
  });
});

describe('COLLECTION_TO_TABLE integrity', () => {
  it('maps every collection to a snake_case (or lower) table name', () => {
    for (const [collection, spec] of Object.entries(COLLECTION_TO_TABLE)) {
      expect(spec.table, `${collection} → ${spec.table}`).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(['HYBRID', 'NORMALIZED']).toContain(spec.mode);
    }
  });

  it('has no duplicate table targets', () => {
    const tables = Object.values(COLLECTION_TO_TABLE).map(s => s.table);
    expect(tables.length).toBe(new Set(tables).size);
  });
});
