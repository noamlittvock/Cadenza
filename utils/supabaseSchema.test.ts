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

function policySql(table: string, policy: string): string {
  const match = SQL.match(new RegExp(`create\\s+policy\\s+${policy}\\s+on\\s+public\\.${table}\\b[\\s\\S]*?;`, 'i'));
  expect(match, `missing policy ${policy} on ${table}`).not.toBeNull();
  return match?.[0] ?? '';
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

// Enforcement under real authenticated roles lives in utils/rlsLive.test.ts.
// That suite signs in actual Supabase users and skips with an explicit env-var
// message when the live test project credentials are absent.
