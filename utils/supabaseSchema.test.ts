import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { COLLECTION_TO_TABLE } from './supabaseSync';

// ── Load all migration SQL once ──────────────────────────────────────────────
const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url);

function allMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
  return files.map(f => readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8')).join('\n');
}

const SQL = allMigrationSql();
const FOUNDATION_TABLES = ['member_capabilities', 'rollover_runs', 'public_endpoints'];
const FINANCE_TABLES = ['charges', 'payments', 'adjustments', 'balance_snapshots'];
const AGREEMENT_TABLES = ['agreement_templates', 'agreement_acceptances'];
const ASSESSMENT_TABLES = ['exam_sessions', 'examiner_submissions', 'certificates', 'report_cards'];
const ROSTER_PROGRAM_SOURCE_TABLES = ['activities', 'enrollments', 'teaching_assignments'];
const CONCERT_TABLES = ['concert_programs'];
const OPERATIONAL_REQUEST_TABLES = ['operational_requests', 'admin_inbox_items'];
const CALENDAR_INTEGRATION_TABLES = ['calendar_subscriptions'];
const FINANCE_REPORT_SOURCES = ['charges', 'payments', 'hoursEntries'];

function policySql(table: string, policy: string): string {
  const match = SQL.match(new RegExp(`create\\s+policy\\s+${policy}\\s+on\\s+public\\.${table}\\b[\\s\\S]*?;`, 'i'));
  expect(match, `missing policy ${policy} on ${table}`).not.toBeNull();
  return match?.[0] ?? '';
}

function latestPolicySql(table: string, policy: string): string {
  const matches = [...SQL.matchAll(new RegExp(`create\\s+policy\\s+${policy}\\s+on\\s+public\\.${table}\\b[\\s\\S]*?;`, 'gi'))];
  expect(matches.length, `missing policy ${policy} on ${table}`).toBeGreaterThan(0);
  return matches.at(-1)?.[0] ?? '';
}

function latestStoragePolicySql(policy: string): string {
  const matches = [...SQL.matchAll(new RegExp(`create\\s+policy\\s+${policy}\\s+on\\s+storage\\.objects\\b[\\s\\S]*?;`, 'gi'))];
  expect(matches.length, `missing policy ${policy} on storage.objects`).toBeGreaterThan(0);
  return matches.at(-1)?.[0] ?? '';
}

/** Quoted string literals inside a `array[ ... ]` expression. */
function arrayLiterals(block: string): string[] {
  const arr = block.match(/array\[([\s\S]*?)\]/i);
  if (!arr) return [];
  return [...arr[1].matchAll(/'([a-z0-9_]+)'/gi)].map(m => m[1]);
}

/** Tables created by a migration: direct `create table public.x` + names in a
 *  `do $$` block that runs `create table ... %I` over a name array (core tables). */
function createdTables(sql: string): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) {
    out.add(m[1]);
  }
  for (const block of sql.matchAll(/do\s+\$\$[\s\S]*?end\s+\$\$/gi)) {
    if (/create\s+table[\s\S]*?%I/i.test(block[0])) {
      for (const name of arrayLiterals(block[0])) out.add(name);
    }
  }
  return out;
}

/** Tables with RLS enabled: per-table `alter table ... enable row level security`
 *  + names in any `do $$` block that enables RLS over a name array. */
function rlsEnabledTables(sql: string): Set<string> {
  const out = new Set<string>();
  for (const m of sql.matchAll(
    /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi
  )) {
    out.add(m[1]);
  }
  for (const block of sql.matchAll(/do\s+\$\$[\s\S]*?end\s+\$\$/gi)) {
    if (/enable\s+row\s+level\s+security/i.test(block[0])) {
      for (const name of arrayLiterals(block[0])) out.add(name);
    }
  }
  return out;
}

const MAPPED_TABLES = [...new Set(Object.values(COLLECTION_TO_TABLE).map(s => s.table))];

describe('migration ↔ supabaseSync schema consistency', () => {
  it('every COLLECTION_TO_TABLE table is created by a migration', () => {
    const created = createdTables(SQL);
    const missing = MAPPED_TABLES.filter(t => !created.has(t));
    expect(missing, `tables mapped in supabaseSync but never created in a migration`).toEqual([]);
  });

  it('every COLLECTION_TO_TABLE table has row-level security enabled', () => {
    const rls = rlsEnabledTables(SQL);
    const unprotected = MAPPED_TABLES.filter(t => !rls.has(t));
    expect(unprotected, `tenant tables shipping without RLS`).toEqual([]);
  });
});

describe('Phase B foundation tables', () => {
  it('creates and protects the capability, rollover, and public endpoint tables', () => {
    const created = createdTables(SQL);
    const rls = rlsEnabledTables(SQL);

    for (const table of FOUNDATION_TABLES) {
      expect(created.has(table), `${table} should be created`).toBe(true);
      expect(rls.has(table), `${table} should have RLS enabled`).toBe(true);
    }
  });

  it('exposes rollover_runs and public_endpoints through the normalized sync map', () => {
    const mapped = new Set(MAPPED_TABLES);
    expect(mapped.has('rollover_runs')).toBe(true);
    expect(mapped.has('public_endpoints')).toBe(true);
  });
});

describe('RLS policy scaffolding (uniform member-read / admin-write)', () => {
  it('defines the security-definer role helpers', () => {
    expect(/create\s+(?:or\s+replace\s+)?function\s+public\.app_is_org_member/i.test(SQL)).toBe(true);
    expect(/create\s+(?:or\s+replace\s+)?function\s+public\.app_is_org_admin/i.test(SQL)).toBe(true);
    expect(/create\s+(?:or\s+replace\s+)?function\s+public\.app_has_capability/i.test(SQL)).toBe(true);
    expect(/create\s+(?:or\s+replace\s+)?function\s+public\.app_is_staff_self/i.test(SQL)).toBe(true);
  });

  it('grants member read and admin write via those helpers', () => {
    expect(/for\s+select\s+using\s*\(\s*public\.app_is_org_member/i.test(SQL)).toBe(true);
    expect(/for\s+all\s+using\s*\(\s*public\.app_is_org_admin/i.test(SQL)).toBe(true);
  });
});

describe('Phase B RLS refinements', () => {
  it('keeps public_endpoints admin-only and inert for anon/public access', () => {
    const read = policySql('public_endpoints', 'public_endpoints_read');
    const write = policySql('public_endpoints', 'public_endpoints_write');

    expect(read).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(write).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(read).not.toMatch(/app_is_org_member|auth\.role\(\)\s*=\s*'anon'/i);
    expect(write).not.toMatch(/app_is_org_member|auth\.role\(\)\s*=\s*'anon'/i);
    expect(SQL).not.toMatch(/grant\s+.*public\.public_endpoints\s+to\s+anon/i);
  });

  it('replaces ledger member-read/admin-write with admin-or-finance policies', () => {
    for (const table of FINANCE_TABLES) {
      const read = policySql(table, `${table}_read`);
      const write = policySql(table, `${table}_write`);

      expect(read, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(read, table).toMatch(/public\.app_has_capability\(org_id,\s*'finance'\)/i);
      expect(read, table).not.toMatch(/app_is_org_member/i);
      expect(write, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(write, table).toMatch(/public\.app_has_capability\(org_id,\s*'finance'\)/i);
    }
  });

  it('allows teacher self-write only through row-scoped lesson/hour policies', () => {
    const lessonWrite = policySql('lesson_records', 'lesson_records_write');
    const lessonInsert = policySql('lesson_records', 'lesson_records_teacher_insert');
    const lessonUpdate = policySql('lesson_records', 'lesson_records_teacher_update');
    const hoursWrite = policySql('hours_entries', 'hours_entries_write');
    const hoursRead = policySql('hours_entries', 'hours_entries_read');
    const hoursInsert = policySql('hours_entries', 'hours_entries_teacher_insert');
    const hoursUpdate = policySql('hours_entries', 'hours_entries_teacher_update');

    expect(lessonWrite).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(lessonWrite).not.toMatch(/app_is_org_member|app_has_capability/i);
    expect(lessonInsert).toMatch(/public\.app_is_staff_self\(org_id,\s*staff_member_id\)/i);
    expect(lessonUpdate).toMatch(/public\.app_is_staff_self\(org_id,\s*staff_member_id\)/i);
    expect(lessonInsert).not.toMatch(/app_is_org_member|app_has_capability/i);
    expect(lessonUpdate).not.toMatch(/app_is_org_member|app_has_capability/i);
    expect(hoursWrite).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(hoursWrite).not.toMatch(/app_is_org_member|app_has_capability/i);
    expect(hoursRead).toMatch(/public\.app_is_staff_self\(org_id,\s*staff_member_id\)/i);
    expect(hoursRead).toMatch(/public\.app_has_capability\(org_id,\s*'finance'\)/i);
    expect(hoursRead).not.toMatch(/app_is_org_member|auth\.role\(\)\s*=\s*'anon'/i);
    expect(hoursInsert).toMatch(/status\s+in\s+\('DRAFT','SUBMITTED'\)/i);
    expect(hoursUpdate).toMatch(/status\s+in\s+\('DRAFT','SUBMITTED'\)/i);
    expect(hoursInsert).toMatch(/public\.app_is_staff_self\(org_id,\s*staff_member_id\)/i);
    expect(hoursUpdate).toMatch(/public\.app_is_staff_self\(org_id,\s*staff_member_id\)/i);
    expect(hoursInsert).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
    expect(hoursUpdate).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
    expect(hoursInsert).not.toMatch(/APPROVED|PAID/i);
    expect(hoursUpdate).not.toMatch(/APPROVED|PAID/i);
  });

  it('narrows Student/Family reads to admin, finance, or teacher own roster', () => {
    const studentsRead = policySql('students', 'students_read');
    const familiesRead = policySql('families', 'families_read');

    expect(SQL).toMatch(/function\s+public\.app_can_read_student\s*\(/i);
    expect(SQL).toMatch(/function\s+public\.app_can_read_family\s*\(/i);
    expect(SQL).toMatch(/from\s+public\.enrollments\s+e[\s\S]*join\s+public\.teaching_assignments\s+ta/i);
    expect(SQL).toMatch(/jsonb_array_elements[\s\S]*p_student_data->'assignments'/i);
    expect(studentsRead).toMatch(/public\.app_can_read_student\(org_id,\s*id,\s*data\)/i);
    expect(familiesRead).toMatch(/public\.app_can_read_family\(org_id,\s*student_ids\)/i);
    expect(studentsRead).not.toMatch(/app_is_org_member/i);
    expect(familiesRead).not.toMatch(/app_is_org_member/i);
  });
});

describe('Public registration intake submit path', () => {
  it('narrows registration_intake queue reads to admins while preserving controlled submit', () => {
    const read = policySql('registration_intake', 'registration_intake_read');
    const write = policySql('registration_intake', 'registration_intake_write');

    expect(read).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(write).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(read).not.toMatch(/app_is_org_member|auth\.role\(\)\s*=\s*'anon'/i);
    expect(write).not.toMatch(/app_is_org_member|auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('adds a tightly scoped RPC for anon/public submit without granting table writes', () => {
    expect(SQL).toMatch(/function\s+public\.submit_registration_intake\s*\(\s*p_token_hash\s+text,\s*p_payload\s+jsonb\s*\)/i);
    expect(SQL).toMatch(/security\s+definer/i);
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.submit_registration_intake\(text,\s*jsonb\)\s+to\s+anon/i);
    expect(SQL).toMatch(/from\s+public\.public_endpoints[\s\S]*token_hash\s*=\s*p_token_hash/i);
    expect(SQL).toMatch(/scopes\s+\?\s+'registration_intake:submit'/i);
    expect(SQL).toMatch(/consent_agreement_id\s+is\s+not\s+null/i);
    expect(SQL).toMatch(/insert\s+into\s+public\.registration_intake/i);
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?public\.registration_intake\s+to\s+anon/i);
    expect(SQL).not.toMatch(/create\s+policy[\s\S]*on\s+public\.registration_intake[\s\S]*auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('stores public applicant fields on quarantined registration_intake rows', () => {
    expect(SQL).toMatch(/add\s+column\s+if\s+not\s+exists\s+applicant_name\s+text/i);
    expect(SQL).toMatch(/add\s+column\s+if\s+not\s+exists\s+applicant_email\s+text/i);
    expect(SQL).toMatch(/add\s+column\s+if\s+not\s+exists\s+applicant_phone\s+text/i);
    expect(SQL).toMatch(/add\s+column\s+if\s+not\s+exists\s+status_history\s+jsonb\s+not\s+null\s+default\s+'\[\]'::jsonb/i);
    expect(SQL).toMatch(/applicant_name,\s*\n\s+applicant_email,\s*\n\s+applicant_phone/i);
    expect(SQL).toMatch(/status_history[\s\S]*jsonb_build_array\(jsonb_build_object/i);
  });
});

describe('Calendar integration endpoint resolver foundation', () => {
  it('narrows direct calendar subscription config access to admins only', () => {
    for (const table of CALENDAR_INTEGRATION_TABLES) {
      const read = latestPolicySql(table, `${table}_read`);
      const write = latestPolicySql(table, `${table}_write`);

      expect(read, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(write, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(read, table).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
      expect(write, table).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
    }
  });

  it('adds a scoped public iCal resolver without granting anon table access', () => {
    expect(SQL).toMatch(/function\s+public\.resolve_calendar_subscription_ical\s*\(\s*p_token_hash\s+text\s*\)/i);
    expect(SQL).toMatch(/security\s+definer/i);
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.resolve_calendar_subscription_ical\(text\)\s+to\s+anon/i);
    expect(SQL).toMatch(/from\s+public\.public_endpoints[\s\S]*token_hash\s*=\s*p_token_hash/i);
    expect(SQL).toMatch(/kind\s+=\s+'CALENDAR_SUBSCRIPTION'/i);
    expect(SQL).toMatch(/scopes\s+\?\s+'calendar_subscription:read'/i);
    expect(SQL).toMatch(/from\s+public\.calendar_subscriptions[\s\S]*id\s+=\s+v_endpoint\.target_id[\s\S]*org_id\s+=\s+v_endpoint\.org_id/i);
    expect(SQL).toMatch(/from\s+public\.events\s+e[\s\S]*e\.org_id\s+=\s+v_endpoint\.org_id/i);
    expect(SQL).toMatch(/isHidden[\s\S]*isCanceled/i);
    expect(SQL).toMatch(/staffMemberIds[\s\S]*roomIds[\s\S]*activityIds[\s\S]*tags/i);
    expect(SQL).toMatch(/update\s+public\.public_endpoints[\s\S]*last_used_at\s+=\s+now\(\)/i);
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?public\.calendar_subscriptions\s+to\s+anon/i);
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?public\.events\s+to\s+anon/i);
    expect(SQL).not.toMatch(/create\s+policy[\s\S]*on\s+public\.calendar_subscriptions[\s\S]*auth\.role\(\)\s*=\s*'anon'/i);
  });
});

describe('Agreement direct-table RLS refinements', () => {
  it('narrows agreement template and acceptance direct access to admins only', () => {
    for (const table of AGREEMENT_TABLES) {
      const read = policySql(table, `${table}_read`);
      const write = policySql(table, `${table}_write`);

      expect(read, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(write, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(read, table).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
      expect(write, table).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
    }
  });

  it('does not grant anon direct access to agreement tables', () => {
    for (const table of AGREEMENT_TABLES) {
      expect(SQL).not.toMatch(new RegExp(`grant\\s+(?:select|insert|update|delete|all)[\\s\\S]*on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+anon`, 'i'));
      expect(SQL).not.toMatch(new RegExp(`create\\s+policy[\\s\\S]*on\\s+public\\.${table}[\\s\\S]*auth\\.role\\(\\)\\s*=\\s*'anon'`, 'i'));
    }
  });
});

describe('Roster/program scoped read foundation', () => {
  it('narrows direct roster source table reads to admins only', () => {
    for (const table of ROSTER_PROGRAM_SOURCE_TABLES) {
      const read = latestPolicySql(table, `${table}_read`);

      expect(read, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(read, table).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
    }
  });

  it('adds a scoped authenticated roster RPC for admin and assigned-teacher reads', () => {
    expect(SQL).toMatch(/function\s+public\.app_can_read_roster_program\s*\(/i);
    expect(SQL).toMatch(/function\s+public\.get_roster_program_view\s*\(\s*p_org\s+text,\s*p_kind\s+text/i);
    expect(SQL).toMatch(/security\s+definer/i);
    expect(SQL).toMatch(/coalesce\(ta\.data->>'staffMemberId',\s*ta\.data->>'staff_member_id'\)\s*=\s*m\.staff_member_id/i);
    expect(SQL).toMatch(/coalesce\(ta\.data->>'activityId',\s*ta\.data->>'activity_id'\)\s*=\s*p_activity_id/i);
    expect(SQL).toMatch(/coalesce\(ta\.data->>'scope',\s*'ACTIVITY'\)\s*=\s*'L2'[\s\S]*coalesce\(ta\.data->>'l2Id',\s*ta\.data->>'l2_id'\)\s*=\s*p_l2_id/i);
    expect(SQL).toMatch(/not\s+public\.app_has_capability\(p_org,\s*'finance'\)/i);
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_roster_program_view\(text,\s*text\)\s+to\s+authenticated/i);
    expect(SQL).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.get_roster_program_view\(text,\s*text\)\s+to\s+anon/i);
  });
});

describe('Public agreement acceptance submit path', () => {
  it('adds a scoped public read RPC for a single pending agreement target', () => {
    expect(SQL).toMatch(/function\s+public\.get_public_agreement_acceptance\s*\(\s*p_token_hash\s+text\s*\)/i);
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.get_public_agreement_acceptance\(text\)\s+to\s+anon/i);
    expect(SQL).toMatch(/from\s+public\.public_endpoints[\s\S]*token_hash\s*=\s*p_token_hash/i);
    expect(SQL).toMatch(/kind\s+=\s+'AGREEMENT_ACCEPTANCE'/i);
    expect(SQL).toMatch(/scopes\s+\?\s+'agreement_acceptance:sign'/i);
    expect(SQL).toMatch(/v_acceptance\.status\s+<>\s+'PENDING'/i);
    expect(SQL).toMatch(/from\s+public\.agreement_templates[\s\S]*id\s+=\s+v_acceptance\.template_id/i);
    expect(SQL).toMatch(/jsonb_build_object\([\s\S]*'template'[\s\S]*'body',\s*v_template\.body/i);
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?public\.agreement_templates\s+to\s+anon/i);
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?public\.agreement_acceptances\s+to\s+anon/i);
  });

  it('adds a tightly scoped RPC for anon/public signing without granting table writes', () => {
    expect(SQL).toMatch(/function\s+public\.submit_agreement_acceptance\s*\(\s*p_token_hash\s+text,\s*p_payload\s+jsonb\s*\)/i);
    expect(SQL).toMatch(/security\s+definer/i);
    expect(SQL).toMatch(/grant\s+execute\s+on\s+function\s+public\.submit_agreement_acceptance\(text,\s*jsonb\)\s+to\s+anon/i);
    expect(SQL).toMatch(/from\s+public\.public_endpoints[\s\S]*token_hash\s*=\s*p_token_hash/i);
    expect(SQL).toMatch(/kind\s+=\s+'AGREEMENT_ACCEPTANCE'/i);
    expect(SQL).toMatch(/scopes\s+\?\s+'agreement_acceptance:sign'/i);
    expect(SQL).toMatch(/consent_agreement_id\s+is\s+not\s+null/i);
    expect(SQL).toMatch(/from\s+public\.agreement_acceptances[\s\S]*id\s+=\s+v_endpoint\.target_id[\s\S]*org_id\s+=\s+v_endpoint\.org_id/i);
    expect(SQL).toMatch(/v_acceptance\.template_id\s+<>\s+v_endpoint\.consent_agreement_id/i);
    expect(SQL).toMatch(/p_payload\s+#>>\s+'\{target,studentId\}'/i);
    expect(SQL).toMatch(/p_payload\s+#>>\s+'\{target,familyId\}'/i);
    expect(SQL).toMatch(/p_payload\s+#>>\s+'\{target,enrollmentId\}'/i);
    expect(SQL).toMatch(/p_payload\s+#>>\s+'\{target,guardianId\}'/i);
    expect(SQL).toMatch(/update\s+public\.agreement_acceptances[\s\S]*where\s+id\s+=\s+v_acceptance\.id/i);
    expect(SQL).toMatch(/update\s+public\.public_endpoints[\s\S]*set\s+status\s+=\s+'EXPIRED'/i);
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?public\.agreement_acceptances\s+to\s+anon/i);
    expect(SQL).not.toMatch(/create\s+policy[\s\S]*on\s+public\.agreement_acceptances[\s\S]*auth\.role\(\)\s*=\s*'anon'/i);
  });
});

describe('Agreement private PDF storage RLS refinements', () => {
  it('keeps signed agreement PDFs out of broad org-member document reads', () => {
    const generalRead = latestStoragePolicySql('documents_read');
    const agreementRead = latestStoragePolicySql('documents_agreements_read');

    expect(generalRead).toMatch(/bucket_id\s*=\s*'documents'/i);
    expect(generalRead).toMatch(/public\.app_is_org_member\(\(storage\.foldername\(name\)\)\[1\]\)/i);
    expect(generalRead).toMatch(/coalesce\(\(storage\.foldername\(name\)\)\[2\],\s*''\)\s*<>\s*'agreements'/i);
    expect(generalRead).not.toMatch(/auth\.role\(\)\s*=\s*'anon'/i);

    expect(agreementRead).toMatch(/bucket_id\s*=\s*'documents'/i);
    expect(agreementRead).toMatch(/\(storage\.foldername\(name\)\)\[2\]\s*=\s*'agreements'/i);
    expect(agreementRead).toMatch(/public\.app_is_org_admin\(\(storage\.foldername\(name\)\)\[1\]\)/i);
    expect(agreementRead).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('does not add anon storage policies for signed agreement PDFs', () => {
    expect(SQL).not.toMatch(/create\s+policy[\s\S]*on\s+storage\.objects[\s\S]*\(storage\.foldername\(name\)\)\[2\]\s*=\s*'agreements'[\s\S]*auth\.role\(\)\s*=\s*'anon'/i);
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?storage\.objects\s+to\s+anon/i);
  });
});

describe('Exams/certificates/report-cards RLS refinements', () => {
  it('narrows assessment table reads to admins or assigned examiners only', () => {
    const sessionRead = latestPolicySql('exam_sessions', 'exam_sessions_read');
    const sessionWrite = latestPolicySql('exam_sessions', 'exam_sessions_write');
    const submissionRead = latestPolicySql('examiner_submissions', 'examiner_submissions_read');
    const submissionWrite = latestPolicySql('examiner_submissions', 'examiner_submissions_write');
    const submissionInsert = latestPolicySql('examiner_submissions', 'examiner_submissions_examiner_insert');
    const submissionUpdate = latestPolicySql('examiner_submissions', 'examiner_submissions_examiner_update');

    expect(SQL).toMatch(/function\s+public\.app_can_read_exam_session\s*\(/i);
    expect(SQL).toMatch(/function\s+public\.app_is_assigned_examiner\s*\(/i);
    expect(SQL).toMatch(/function\s+public\.app_can_write_examiner_submission\s*\(/i);
    expect(SQL).toMatch(/examiner_staff_ids\s+\?\s+m\.staff_member_id/i);
    expect(SQL).toMatch(/examiner_staff_ids\s+\?\s+p_examiner_staff_id/i);
    expect(SQL).toMatch(/student_ids\s+\?\s+p_student_id/i);
    expect(SQL).toMatch(/not\s+public\.app_has_capability\(p_org,\s*'finance'\)/i);
    expect(SQL).toMatch(/s\.status\s+in\s+\('SCHEDULED','IN_PROGRESS'\)/i);

    expect(sessionRead).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(sessionRead).toMatch(/public\.app_can_read_exam_session\(org_id,\s*id\)/i);
    expect(sessionRead).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
    expect(sessionWrite).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(sessionWrite).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);

    expect(submissionRead).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(submissionRead).toMatch(/public\.app_is_assigned_examiner\(org_id,\s*exam_session_id,\s*student_id,\s*examiner_staff_id\)/i);
    expect(submissionRead).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
    expect(submissionWrite).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(submissionWrite).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
    expect(submissionInsert).toMatch(/public\.app_can_write_examiner_submission\(org_id,\s*exam_session_id,\s*student_id,\s*examiner_staff_id\)/i);
    expect(submissionUpdate).toMatch(/public\.app_can_write_examiner_submission\(org_id,\s*exam_session_id,\s*student_id,\s*examiner_staff_id\)/i);
    expect(submissionInsert).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
    expect(submissionUpdate).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('keeps certificates and report cards admin-only for direct table access', () => {
    for (const table of ['certificates', 'report_cards']) {
      const read = latestPolicySql(table, `${table}_read`);
      const write = latestPolicySql(table, `${table}_write`);

      expect(read, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(write, table).toMatch(/public\.app_is_org_admin\(org_id\)/i);
      expect(read, table).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
      expect(write, table).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
    }
  });

  it('does not grant anon or broad member direct access to assessment tables', () => {
    for (const table of ASSESSMENT_TABLES) {
      expect(SQL).not.toMatch(new RegExp(`grant\\s+(?:select|insert|update|delete|all)[\\s\\S]*on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+anon`, 'i'));
      expect(latestPolicySql(table, `${table}_read`)).not.toMatch(/app_is_org_member/i);
      expect(latestPolicySql(table, `${table}_write`)).not.toMatch(/app_is_org_member/i);
      expect(SQL).not.toMatch(new RegExp(`create\\s+policy[\\s\\S]*on\\s+public\\.${table}[\\s\\S]*auth\\.role\\(\\)\\s*=\\s*'anon'`, 'i'));
    }
  });

  it('keeps private assessment files out of broad org-member document reads', () => {
    const generalRead = latestStoragePolicySql('documents_read');
    const assessmentRead = latestStoragePolicySql('documents_assessments_read');

    expect(generalRead).toMatch(/bucket_id\s*=\s*'documents'/i);
    expect(generalRead).toMatch(/public\.app_is_org_member\(\(storage\.foldername\(name\)\)\[1\]\)/i);
    expect(generalRead).toMatch(/coalesce\(\(storage\.foldername\(name\)\)\[2\],\s*''\)\s+not\s+in\s+\('assessments','certificates','report-cards'(?:,'concert-programs')?\)/i);
    expect(generalRead).not.toMatch(/auth\.role\(\)\s*=\s*'anon'/i);

    expect(assessmentRead).toMatch(/bucket_id\s*=\s*'documents'/i);
    expect(assessmentRead).toMatch(/\(storage\.foldername\(name\)\)\[2\]\s+in\s+\('assessments','certificates','report-cards'\)/i);
    expect(assessmentRead).toMatch(/public\.app_is_org_admin\(\(storage\.foldername\(name\)\)\[1\]\)/i);
    expect(assessmentRead).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
  });
});

describe('Concert programs/events RLS refinements', () => {
  it('narrows concert program direct reads to admins or linked non-finance staff', () => {
    const read = latestPolicySql('concert_programs', 'concert_programs_read');
    const write = latestPolicySql('concert_programs', 'concert_programs_write');

    expect(SQL).toMatch(/function\s+public\.app_can_read_concert_program\s*\(/i);
    expect(SQL).toMatch(/from\s+public\.event_participants\s+ep[\s\S]*coalesce\(ep\.data->>'eventId',\s*ep\.data->>'event_id'\)\s*=\s*p_event_id/i);
    expect(SQL).toMatch(/coalesce\(ep\.data->>'staffMemberId',\s*ep\.data->>'staff_member_id'\)\s*=\s*m\.staff_member_id/i);
    expect(SQL).toMatch(/jsonb_array_elements\(coalesce\(p_pieces,\s*'\[\]'::jsonb\)\)\s+piece/i);
    expect(SQL).toMatch(/coalesce\(piece->'performerStaffIds',\s*'\[\]'::jsonb\)\s+\?\s+m\.staff_member_id/i);
    expect(SQL).toMatch(/not\s+public\.app_has_capability\(p_org,\s*'finance'\)/i);

    expect(read).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(read).toMatch(/public\.app_can_read_concert_program\(org_id,\s*event_id,\s*pieces\)/i);
    expect(read).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
    expect(write).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(write).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('does not grant anon or broad member direct access to concert program tables', () => {
    for (const table of CONCERT_TABLES) {
      expect(SQL).not.toMatch(new RegExp(`grant\\s+(?:select|insert|update|delete|all)[\\s\\S]*on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+anon`, 'i'));
      expect(latestPolicySql(table, `${table}_read`)).not.toMatch(/app_is_org_member/i);
      expect(latestPolicySql(table, `${table}_write`)).not.toMatch(/app_is_org_member/i);
      expect(SQL).not.toMatch(new RegExp(`create\\s+policy[\\s\\S]*on\\s+public\\.${table}[\\s\\S]*auth\\.role\\(\\)\\s*=\\s*'anon'`, 'i'));
    }
  });

  it('keeps private concert program files out of broad org-member document reads', () => {
    const generalRead = latestStoragePolicySql('documents_read');
    const concertRead = latestStoragePolicySql('documents_concert_programs_read');

    expect(generalRead).toMatch(/bucket_id\s*=\s*'documents'/i);
    expect(generalRead).toMatch(/public\.app_is_org_member\(\(storage\.foldername\(name\)\)\[1\]\)/i);
    expect(generalRead).toMatch(/coalesce\(\(storage\.foldername\(name\)\)\[2\],\s*''\)\s+not\s+in\s+\('assessments','certificates','report-cards','concert-programs'\)/i);
    expect(generalRead).not.toMatch(/auth\.role\(\)\s*=\s*'anon'/i);

    expect(concertRead).toMatch(/bucket_id\s*=\s*'documents'/i);
    expect(concertRead).toMatch(/\(storage\.foldername\(name\)\)\[2\]\s*=\s*'concert-programs'/i);
    expect(concertRead).toMatch(/public\.app_is_org_admin\(\(storage\.foldername\(name\)\)\[1\]\)/i);
    expect(concertRead).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
  });
});

describe('Rooms/absence request RLS refinements', () => {
  it('narrows operational request reads to admins or requesting staff only', () => {
    const read = latestPolicySql('operational_requests', 'operational_requests_read');
    const write = latestPolicySql('operational_requests', 'operational_requests_write');
    const insert = latestPolicySql('operational_requests', 'operational_requests_teacher_insert');
    const cancel = latestPolicySql('operational_requests', 'operational_requests_teacher_cancel_pending');

    expect(read).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(read).toMatch(/public\.app_is_staff_self\(org_id,\s*requested_by_staff_id\)/i);
    expect(read).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);

    expect(write).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(write).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);

    expect(insert).toMatch(/public\.app_is_staff_self\(org_id,\s*requested_by_staff_id\)/i);
    expect(insert).toMatch(/status\s+=\s+'PENDING'/i);
    expect(insert).toMatch(/decided_by\s+is\s+null/i);
    expect(insert).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);

    expect(cancel).toMatch(/status\s+=\s+'PENDING'/i);
    expect(cancel).toMatch(/status\s+=\s+'CANCELLED'/i);
    expect(cancel).toMatch(/public\.app_is_staff_self\(org_id,\s*requested_by_staff_id\)/i);
    expect(cancel).not.toMatch(/APPROVED|REJECTED|app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('scopes linked operational-request Admin Inbox approval items without hiding normal notifications', () => {
    const read = latestPolicySql('admin_inbox_items', 'admin_inbox_items_read');
    const write = latestPolicySql('admin_inbox_items', 'admin_inbox_items_write');
    const teacherInsert = latestPolicySql('admin_inbox_items', 'admin_inbox_items_operational_request_teacher_insert');

    expect(read).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(read).toMatch(/coalesce\(data->>'type',\s*''\)\s*<>\s*'APPROVAL_REQUEST'/i);
    expect(read).toMatch(/public\.app_is_org_member\(org_id\)/i);
    expect(read).toMatch(/data->>'type'\s*=\s*'APPROVAL_REQUEST'/i);
    expect(read).toMatch(/data->>'relatedEntityType'\s*=\s*'operationalRequest'/i);
    expect(read).toMatch(/public\.app_is_staff_self\(org_id,\s*data->>'requestedBy'\)/i);
    expect(read).not.toMatch(/app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);

    expect(write).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(write).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);

    expect(teacherInsert).toMatch(/data->>'type'\s*=\s*'APPROVAL_REQUEST'/i);
    expect(teacherInsert).toMatch(/data->>'status'\s*=\s*'OPEN'/i);
    expect(teacherInsert).toMatch(/data->>'relatedEntityType'\s*=\s*'operationalRequest'/i);
    expect(teacherInsert).toMatch(/public\.app_is_staff_self\(org_id,\s*data->>'requestedBy'\)/i);
    expect(teacherInsert).not.toMatch(/app_is_org_member|app_has_capability|auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('does not grant anon or broad member direct access to operational request tables', () => {
    for (const table of OPERATIONAL_REQUEST_TABLES) {
      expect(SQL).not.toMatch(new RegExp(`grant\\s+(?:select|insert|update|delete|all)[\\s\\S]*on\\s+(?:table\\s+)?public\\.${table}\\s+to\\s+anon`, 'i'));
      expect(latestPolicySql(table, `${table}_read`)).not.toMatch(/auth\.role\(\)\s*=\s*'anon'/i);
      expect(latestPolicySql(table, `${table}_write`)).not.toMatch(/app_is_org_member|auth\.role\(\)\s*=\s*'anon'/i);
    }
    expect(latestPolicySql('operational_requests', 'operational_requests_read')).not.toMatch(/app_is_org_member/i);
  });
});

describe('Report definition RLS refinements', () => {
  it('narrows report definition reads to admin plus finance-authorized sources', () => {
    const read = latestPolicySql('report_definitions', 'report_definitions_read');
    const write = latestPolicySql('report_definitions', 'report_definitions_write');

    expect(read).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(read).toMatch(/public\.app_has_capability\(org_id,\s*'finance'\)/i);
    expect(read).toMatch(/source_entity\s+in\s+\('charges',\s*'payments',\s*'hoursEntries'\)/i);
    for (const source of FINANCE_REPORT_SOURCES) {
      expect(read).toContain(`'${source}'`);
    }
    expect(read).not.toMatch(/app_is_org_member|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);

    expect(write).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(write).not.toMatch(/app_is_org_member|app_has_capability|app_is_staff_self|auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('does not grant anon or broad member direct access to report definitions', () => {
    expect(SQL).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on\s+(?:table\s+)?public\.report_definitions\s+to\s+anon/i);
    expect(latestPolicySql('report_definitions', 'report_definitions_read')).not.toMatch(/app_is_org_member/i);
    expect(latestPolicySql('report_definitions', 'report_definitions_write')).not.toMatch(/app_is_org_member/i);
    expect(SQL).not.toMatch(/create\s+policy[\s\S]*on\s+public\.report_definitions[\s\S]*auth\.role\(\)\s*=\s*'anon'/i);
  });
});

describe('Operations command center security posture', () => {
  it('does not create a persisted operations aggregate table or public dashboard endpoint', () => {
    const created = createdTables(SQL);

    expect(created.has('operations_dashboard')).toBe(false);
    expect(created.has('operations_snapshots')).toBe(false);
    expect(SQL).not.toMatch(/create\s+(?:or\s+replace\s+)?function\s+public\.get_operations_snapshot/i);
    expect(SQL).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.get_operations_snapshot[\s\S]*\b(?:anon|public)\b/i);
    expect(SQL).not.toMatch(/create\s+policy[\s\S]*on\s+public\.(?:operations_dashboard|operations_snapshots)[\s\S]*auth\.role\(\)\s*=\s*'anon'/i);
  });

  it('keeps operations source policies dependent on source-specific admin/finance rules', () => {
    const hoursRead = latestPolicySql('hours_entries', 'hours_entries_read');
    const reportRead = latestPolicySql('report_definitions', 'report_definitions_read');

    expect(hoursRead).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(hoursRead).toMatch(/public\.app_has_capability\(org_id,\s*'finance'\)/i);
    expect(hoursRead).toMatch(/public\.app_is_staff_self\(org_id,\s*staff_member_id\)/i);
    expect(reportRead).toMatch(/public\.app_is_org_admin\(org_id\)/i);
    expect(reportRead).toMatch(/public\.app_has_capability\(org_id,\s*'finance'\)/i);
    expect(reportRead).toMatch(/source_entity\s+in\s+\('charges',\s*'payments',\s*'hoursEntries'\)/i);
  });
});

// Enforcement under real authenticated roles lives in utils/rlsLive.test.ts.
// That suite signs in actual Supabase users and skips with an explicit env-var
// message when the live test project credentials are absent.
