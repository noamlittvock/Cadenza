import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type EnvSource = Record<string, string | undefined>;

export const LIVE_RLS_ENV_VARS = [
  'CADENZA_RLS_SUPABASE_URL',
  'CADENZA_RLS_SUPABASE_ANON_KEY',
  'CADENZA_RLS_SUPABASE_SERVICE_ROLE_KEY',
  'CADENZA_RLS_ORG_ID',
  'CADENZA_RLS_CROSS_ORG_ID',
  'CADENZA_RLS_ADMIN_EMAIL',
  'CADENZA_RLS_ADMIN_PASSWORD',
  'CADENZA_RLS_TEACHER_EMAIL',
  'CADENZA_RLS_TEACHER_PASSWORD',
  'CADENZA_RLS_TEACHER_STAFF_MEMBER_ID',
  'CADENZA_RLS_FINANCE_EMAIL',
  'CADENZA_RLS_FINANCE_PASSWORD',
  'CADENZA_RLS_CROSS_ORG_EMAIL',
  'CADENZA_RLS_CROSS_ORG_PASSWORD',
] as const;

export type LiveRlsEnvVar = typeof LIVE_RLS_ENV_VARS[number];

export interface LiveRlsConfig {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  orgId: string;
  crossOrgId: string;
  admin: Credentials;
  teacher: Credentials & { staffMemberId: string };
  finance: Credentials;
  crossOrg: Credentials;
}

export interface Credentials {
  email: string;
  password: string;
}

export type LiveRlsEnv =
  | { ready: true; config: LiveRlsConfig; missing: []; skipReason: '' }
  | { ready: false; missing: LiveRlsEnvVar[]; skipReason: string };

export interface SignedInRoleClient {
  client: SupabaseClient;
  userId: string;
  email: string;
}

export interface LiveRlsHarness {
  service: SupabaseClient;
  anon: SupabaseClient;
  admin: SignedInRoleClient;
  teacher: SignedInRoleClient;
  finance: SignedInRoleClient;
  crossOrg: SignedInRoleClient;
  id(prefix: string): string;
  track(table: string, id: string): void;
  cleanupTrackedRows(): Promise<void>;
  signOut(): Promise<void>;
}

const envNames = {
  supabaseUrl: 'CADENZA_RLS_SUPABASE_URL',
  anonKey: 'CADENZA_RLS_SUPABASE_ANON_KEY',
  serviceRoleKey: 'CADENZA_RLS_SUPABASE_SERVICE_ROLE_KEY',
  orgId: 'CADENZA_RLS_ORG_ID',
  crossOrgId: 'CADENZA_RLS_CROSS_ORG_ID',
  adminEmail: 'CADENZA_RLS_ADMIN_EMAIL',
  adminPassword: 'CADENZA_RLS_ADMIN_PASSWORD',
  teacherEmail: 'CADENZA_RLS_TEACHER_EMAIL',
  teacherPassword: 'CADENZA_RLS_TEACHER_PASSWORD',
  teacherStaffMemberId: 'CADENZA_RLS_TEACHER_STAFF_MEMBER_ID',
  financeEmail: 'CADENZA_RLS_FINANCE_EMAIL',
  financePassword: 'CADENZA_RLS_FINANCE_PASSWORD',
  crossOrgEmail: 'CADENZA_RLS_CROSS_ORG_EMAIL',
  crossOrgPassword: 'CADENZA_RLS_CROSS_ORG_PASSWORD',
} as const satisfies Record<string, LiveRlsEnvVar>;

function readRequired(env: EnvSource, name: LiveRlsEnvVar): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

export function getLiveRlsEnv(env: EnvSource = process.env): LiveRlsEnv {
  const missing = LIVE_RLS_ENV_VARS.filter(name => !readRequired(env, name));
  if (missing.length) {
    return {
      ready: false,
      missing,
      skipReason: `set ${missing.join(', ')} to run live Supabase RLS tests`,
    };
  }

  return {
    ready: true,
    missing: [],
    skipReason: '',
    config: {
      supabaseUrl: readRequired(env, envNames.supabaseUrl) as string,
      anonKey: readRequired(env, envNames.anonKey) as string,
      serviceRoleKey: readRequired(env, envNames.serviceRoleKey) as string,
      orgId: readRequired(env, envNames.orgId) as string,
      crossOrgId: readRequired(env, envNames.crossOrgId) as string,
      admin: {
        email: readRequired(env, envNames.adminEmail) as string,
        password: readRequired(env, envNames.adminPassword) as string,
      },
      teacher: {
        email: readRequired(env, envNames.teacherEmail) as string,
        password: readRequired(env, envNames.teacherPassword) as string,
        staffMemberId: readRequired(env, envNames.teacherStaffMemberId) as string,
      },
      finance: {
        email: readRequired(env, envNames.financeEmail) as string,
        password: readRequired(env, envNames.financePassword) as string,
      },
      crossOrg: {
        email: readRequired(env, envNames.crossOrgEmail) as string,
        password: readRequired(env, envNames.crossOrgPassword) as string,
      },
    },
  };
}

function createSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function signInRole(config: LiveRlsConfig, credentials: Credentials): Promise<SignedInRoleClient> {
  const client = createSupabaseClient(config.supabaseUrl, config.anonKey);
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) throw new Error(`Failed to sign in ${credentials.email}: ${error.message}`);
  const userId = data.user?.id;
  if (!userId) throw new Error(`Failed to resolve auth user id for ${credentials.email}`);
  return { client, userId, email: credentials.email };
}

async function assertNoError(error: { message?: string } | null, context: string): Promise<void> {
  if (error) throw new Error(`${context}: ${error.message ?? 'unknown Supabase error'}`);
}

async function maybeSingleRow(
  service: SupabaseClient,
  table: string,
  filters: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  let query = service.from(table).select('*');
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query.maybeSingle();
  await assertNoError(error, `preflight select ${table}`);
  return (data as Record<string, unknown> | null) ?? null;
}

async function seedRoleRows(
  service: SupabaseClient,
  config: LiveRlsConfig,
  roles: {
    admin: SignedInRoleClient;
    teacher: SignedInRoleClient;
    finance: SignedInRoleClient;
    crossOrg: SignedInRoleClient;
  },
): Promise<void> {
  if (config.orgId === config.crossOrgId) {
    throw new Error('CADENZA_RLS_CROSS_ORG_ID must differ from CADENZA_RLS_ORG_ID');
  }

  const crossPrimaryMembership = await maybeSingleRow(service, 'org_members', {
    user_id: roles.crossOrg.userId,
    org_id: config.orgId,
  });
  if (crossPrimaryMembership) {
    throw new Error(
      `CADENZA_RLS_CROSS_ORG_EMAIL (${roles.crossOrg.email}) must not be a member of CADENZA_RLS_ORG_ID (${config.orgId})`,
    );
  }

  const teacherFinanceCapability = await maybeSingleRow(service, 'member_capabilities', {
    user_id: roles.teacher.userId,
    org_id: config.orgId,
    capability: 'finance',
  });
  if (teacherFinanceCapability) {
    throw new Error(
      `CADENZA_RLS_TEACHER_EMAIL (${roles.teacher.email}) must not have the finance capability in ${config.orgId}`,
    );
  }

  const { error: membershipError } = await service.from('org_members').upsert(
    [
      { user_id: roles.admin.userId, org_id: config.orgId, role: 'ADMIN', staff_member_id: null },
      { user_id: roles.teacher.userId, org_id: config.orgId, role: 'STAFF', staff_member_id: config.teacher.staffMemberId },
      { user_id: roles.finance.userId, org_id: config.orgId, role: 'STAFF', staff_member_id: null },
      { user_id: roles.crossOrg.userId, org_id: config.crossOrgId, role: 'STAFF', staff_member_id: null },
    ],
    { onConflict: 'user_id,org_id' },
  );
  await assertNoError(membershipError, 'seed org_members live RLS fixtures');

  const { error: capabilityError } = await service.from('member_capabilities').upsert(
    {
      user_id: roles.finance.userId,
      org_id: config.orgId,
      capability: 'finance',
      created_by: 'rls-live-harness',
      updated_by: 'rls-live-harness',
    },
    { onConflict: 'user_id,org_id,capability' },
  );
  await assertNoError(capabilityError, 'seed member_capabilities live RLS fixture');
}

export async function createLiveRlsHarness(config: LiveRlsConfig): Promise<LiveRlsHarness> {
  const service = createSupabaseClient(config.supabaseUrl, config.serviceRoleKey);
  const anon = createSupabaseClient(config.supabaseUrl, config.anonKey);
  const admin = await signInRole(config, config.admin);
  const teacher = await signInRole(config, config.teacher);
  const finance = await signInRole(config, config.finance);
  const crossOrg = await signInRole(config, config.crossOrg);
  const cleanup = new Map<string, Set<string>>();

  await seedRoleRows(service, config, { admin, teacher, finance, crossOrg });

  return {
    service,
    anon,
    admin,
    teacher,
    finance,
    crossOrg,
    id(prefix: string): string {
      const safePrefix = prefix.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      return `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    },
    track(table: string, id: string): void {
      if (!cleanup.has(table)) cleanup.set(table, new Set());
      cleanup.get(table)?.add(id);
    },
    async cleanupTrackedRows(): Promise<void> {
      for (const [table, ids] of cleanup) {
        if (!ids.size) continue;
        const { error } = await service.from(table).delete().in('id', [...ids]);
        await assertNoError(error, `cleanup ${table}`);
      }
      cleanup.clear();
    },
    async signOut(): Promise<void> {
      await Promise.all([
        admin.client.auth.signOut(),
        teacher.client.auth.signOut(),
        finance.client.auth.signOut(),
        crossOrg.client.auth.signOut(),
      ]);
    },
  };
}
