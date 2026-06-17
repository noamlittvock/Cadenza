import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabase } from '../utils/supabaseClient';
import { fetchCollectionItems, upsertCollectionItems } from '../utils/supabaseSync';
import { generateId } from '../constants';
import { nowTimestamp } from '../utils/appTimestamp';
import type { StaffMemberV2, StaffRole } from '../types/v2';
import { Lock, LogIn, AlertCircle, Loader2, Music } from 'lucide-react';

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'VIEWER';

interface User {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  orgId: string;
}

interface OrgInfo {
  id: string;
  name: string;
  logoUrl?: string;
}

interface OrgRow {
  id: string;
  name: string;
  logo_url?: string | null;
}

interface AccessRecordRow {
  id: string;
  email: string;
  allowed: boolean;
  role: 'ADMIN' | 'VIEWER';
  org_id: string;
}

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  orgId: string | null;
  availableOrgs: OrgInfo[] | null;
  googleAccessToken: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Superadmin email - has access to all tenants, sandbox, and superadmin tools.
const SUPERADMIN_EMAIL = 'noam.littvock@gmail.com';

// ─── E2E Auth Bypass ─────────────────────────────────────────────────────────
// When VITE_E2E_AUTH_BYPASS=true (set via .env.e2e), skip external auth
// and inject a mock SuperAdmin user so Playwright tests can run without OAuth.
const E2EAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const mockOrgId = pathParts[0] || 'test-org';
  const mockValue: AuthContextType = {
    currentUser: { id: 'e2e-uid', uid: 'e2e-uid', name: 'E2E Admin', email: 'e2e@cadenza.test', role: 'SUPERADMIN', orgId: mockOrgId },
    isAdmin: true,
    isSuperAdmin: true,
    orgId: mockOrgId,
    availableOrgs: [{ id: mockOrgId, name: 'Test Org' }],
    googleAccessToken: null,
    login: async () => {},
    logout: async () => {},
  };
  return <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (
    import.meta.env.VITE_E2E_AUTH_BYPASS === 'true' ||
    import.meta.env.VITE_E2E_FIREBASE_BYPASS === 'true' ||
    import.meta.env.VITE_LOCAL_MODE === 'true'
  ) {
    return <E2EAuthProvider>{children}</E2EAuthProvider>;
  }
  return <RealAuthProvider>{children}</RealAuthProvider>;
};

const RealAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableOrgs, setAvailableOrgs] = useState<OrgInfo[] | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => sessionStorage.getItem('gcal_token'));
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extract orgSlug from the URL path (e.g., /alpert -> alpert)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const orgSlug = pathParts[0] || null;

  const fallbackOrgName = (slug: string) => slug.charAt(0).toUpperCase() + slug.slice(1);
  const toOrgInfo = (org: OrgRow | null | undefined, slug: string): OrgInfo => ({
    id: slug,
    name: org?.name || fallbackOrgName(slug),
    logoUrl: org?.logo_url || undefined,
  });
  const displayNameFor = (user: SupabaseUser, fallbackEmail: string) =>
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    fallbackEmail;
  const avatarFor = (user: SupabaseUser) =>
    (user.user_metadata?.avatar_url as string | undefined) ||
    (user.user_metadata?.picture as string | undefined) ||
    undefined;

  const fetchOrg = async (slug: string): Promise<OrgRow | null> => {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from('organizations').select('id,name,logo_url').eq('id', slug).maybeSingle();
    if (error) console.error('[AuthContext] organization lookup failed', error);
    return (data as OrgRow | null) ?? null;
  };

  const upsertOrg = async (slug: string, name = fallbackOrgName(slug)) => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('organizations').upsert({
      id: slug,
      name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) console.error('[AuthContext] organization upsert failed', error);
  };

  const fetchAccessById = async (id: string): Promise<AccessRecordRow | null> => {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from('access_control').select('*').eq('id', id).maybeSingle();
    if (error) console.error('[AuthContext] access lookup failed', error);
    return (data as AccessRecordRow | null) ?? null;
  };

  const fetchAccessForEmail = async (email: string): Promise<AccessRecordRow[]> => {
    const sb = getSupabase();
    if (!sb) return [];
    const { data, error } = await sb.from('access_control').select('*').eq('email', email).eq('allowed', true);
    if (error) {
      console.error('[AuthContext] access list failed', error);
      return [];
    }
    return (data ?? []) as AccessRecordRow[];
  };

  const upsertAccess = async (email: string, slug: string, role: 'ADMIN' | 'VIEWER') => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('access_control').upsert({
      id: `${email}_${slug}`,
      email,
      allowed: true,
      role,
      org_id: slug,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) console.error('[AuthContext] access upsert failed', error);
  };

  const upsertOrgMember = async (
    slug: string,
    userId: string,
    role: 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'VIEWER',
    staffMemberId = '',
  ) => {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('org_members').upsert({
      user_id: userId,
      org_id: slug,
      staff_member_id: staffMemberId,
      role,
    }, { onConflict: 'user_id,org_id' });
    if (error) console.error('[AuthContext] org member upsert failed', error);
  };

  const provisionStaff = async (slug: string, user: SupabaseUser, email: string, role: UserRole): Promise<string> => {
    const now = nowTimestamp();
    const staffRole: StaffRole = role === 'VIEWER' ? 'STAFF' : 'ADMIN';
    const staff = await fetchCollectionItems<StaffMemberV2>(slug, 'staffMembers');
    const existing = staff.find(s => s.email.toLowerCase() === email);
    const staffMemberId = existing?.id ?? generateId();
    const next: StaffMemberV2 = {
      ...(existing ?? {
        id: staffMemberId,
        orgId: slug,
        uid: user.id,
        role: staffRole,
        fullName: displayNameFor(user, email),
        email,
        phone: null,
        startDate: null,
        isArchived: false,
        createdAt: now,
        isFirstAdmin: role === 'ADMIN',
        onboardingDismissed: false,
        firstUseFlags: { activityHub: false, staffModule: false, eventCreation: false, enrollment: false },
        documents: [],
      }),
      uid: user.id,
      role: staffRole,
      updatedAt: now,
    };
    await upsertCollectionItems(slug, 'staffMembers', [next]);
    await upsertOrgMember(slug, user.id, staffRole, staffMemberId);

    const sb = getSupabase();
    if (sb) {
      const { error } = await sb.from('user_profiles').upsert({
        id: `${user.id}_${slug}`,
        uid: user.id,
        org_id: slug,
        staff_member_id: staffMemberId,
        role: staffRole,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) console.error('[AuthContext] user profile upsert failed', error);
    }
    return staffMemberId;
  };

  useEffect(() => {
    let cancelled = false;
    const sb = getSupabase();
    if (!sb) {
      setErrorMsg('Supabase is not configured for this deployment.');
      setLoading(false);
      return;
    }

    const applySession = async (session: Session | null) => {
      const supaUser = session?.user ?? null;
      if (session?.provider_token) {
        setGoogleAccessToken(session.provider_token);
        sessionStorage.setItem('gcal_token', session.provider_token);
      }

      if (!supaUser?.email) {
        setCurrentUser(null);
        setAvailableOrgs(null);
        setLoading(false);
        return;
      }

      const normalizedEmail = supaUser.email.toLowerCase().trim();
      const isSuperAdminUser = normalizedEmail === SUPERADMIN_EMAIL.toLowerCase().trim();
      const baseUser = {
        id: supaUser.id,
        uid: supaUser.id,
        name: displayNameFor(supaUser, normalizedEmail),
        email: supaUser.email,
        avatar: avatarFor(supaUser),
      };

      try {
        if (orgSlug) {
          const composite = await fetchAccessById(`${normalizedEmail}_${orgSlug}`);
          const legacy = await fetchAccessById(normalizedEmail);
          const valid = [composite, legacy].find(r => r?.allowed && r.org_id === orgSlug) ?? null;

          if (valid || isSuperAdminUser) {
            const resolvedRole: UserRole = isSuperAdminUser ? 'SUPERADMIN' : (valid?.role ?? 'VIEWER');
            if (isSuperAdminUser) {
              await upsertOrgMember(orgSlug, supaUser.id, 'SUPER_ADMIN');
              await upsertOrg(orgSlug);
              await upsertAccess(normalizedEmail, orgSlug, 'ADMIN');
            } else {
              await provisionStaff(orgSlug, supaUser, normalizedEmail, resolvedRole);
            }

            const org = await fetchOrg(orgSlug);
            if (!cancelled) {
              setCurrentUser({ ...baseUser, role: resolvedRole, orgId: orgSlug });
              setAvailableOrgs([toOrgInfo(org, orgSlug)]);
              setErrorMsg(null);
            }
          } else {
            await sb.auth.signOut();
            if (!cancelled) {
              setCurrentUser(null);
              setErrorMsg(`Your account does not have access to the '${orgSlug}' workspace.`);
            }
          }
        } else {
          let orgSlugs: string[] = [];
          if (isSuperAdminUser) {
            const { data, error } = await sb.from('organizations').select('id');
            if (error) console.error('[AuthContext] organization list failed', error);
            orgSlugs = (data ?? []).map((r: { id: string }) => r.id);
            if (!orgSlugs.includes('sandbox')) orgSlugs.push('sandbox');
          } else {
            const records = await fetchAccessForEmail(normalizedEmail);
            orgSlugs = records.map(r => r.org_id);
          }

          orgSlugs = [...new Set(orgSlugs)];
          if (orgSlugs.length === 0 && !isSuperAdminUser) {
            if (!cancelled) {
              setErrorMsg('No workspaces found for your account.');
              setAvailableOrgs([]);
            }
          } else {
            const orgsWithNames = await Promise.all(orgSlugs.map(async slug => toOrgInfo(await fetchOrg(slug), slug)));
            if (!cancelled) {
              setAvailableOrgs(orgsWithNames);
              setCurrentUser({ ...baseUser, role: isSuperAdminUser ? 'SUPERADMIN' : 'VIEWER', orgId: '' });
              setErrorMsg(null);
            }
          }
        }
      } catch (error) {
        console.error('Auth Error:', error);
        if (!cancelled) setErrorMsg('Error verifying access permissions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void sb.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [orgSlug]);

  const login = async () => {
    setErrorMsg(null);
    setLoading(true);
    const sb = getSupabase();
    if (!sb) {
      setErrorMsg('Supabase is not configured for this deployment.');
      setLoading(false);
      return;
    }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        scopes: 'openid email profile https://www.googleapis.com/auth/calendar.events',
      },
    });
    if (error) {
      console.error(error);
      setErrorMsg('Failed to sign in. Please try again.');
      setLoading(false);
    }
  };

  const logout = async () => {
    const sb = getSupabase();
    await sb?.auth.signOut();
    setGoogleAccessToken(null);
    sessionStorage.removeItem('gcal_token');
    if (orgSlug) {
      window.location.href = '/';
    }
  };

  const value = {
    currentUser,
    isAdmin: currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPERADMIN',
    isSuperAdmin: currentUser?.role === 'SUPERADMIN',
    orgId: currentUser?.orgId || null,
    availableOrgs,
    googleAccessToken,
    login,
    logout
  };

  // 3. Gateway / Workspace Selector / Authentication Guard
  if (!orgSlug || !currentUser) {
    return (
      <div
        className="flex min-h-screen items-end justify-center px-4 pt-8 pb-10 sm:pb-14 bg-cover bg-top bg-no-repeat bg-slate-950 relative overflow-hidden"
        style={{ backgroundImage: 'url("/login.png")' }}
      >
        {/* Bottom legibility gradient — keeps tablet visible while anchoring the card */}
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent pointer-events-none"></div>

        <div className="w-full max-w-md relative z-10 transition-all duration-700 ease-out">
          <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] border border-white/20 dark:border-slate-700/50 overflow-hidden transform transition-all duration-500">
            <div className="p-8">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin mb-6"></div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold tracking-wide">Syncing with Cadenza Cloud...</p>
                </div>
              ) : !currentUser ? (
                <div className="space-y-6">

                  <button
                    onClick={login}
                    className="w-full flex items-center justify-center space-x-3 rtl:space-x-reverse bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white py-4 px-6 rounded-2xl font-bold transition-all shadow-xl hover:shadow-blue-500/20 active:scale-[0.98] group"
                  >
                    <LogIn size={20} className="group-hover:translate-x-1 transition-transform" />
                    <span>Sign In with Google</span>
                  </button>

                  {errorMsg && (
                    <div className="flex items-center space-x-2 rtl:space-x-reverse p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl text-red-600 dark:text-red-400 text-sm animate-shake">
                      <AlertCircle size={18} />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-4 rtl:space-x-reverse mb-10 p-5 bg-slate-50/80 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 border-2 border-white dark:border-slate-700 shadow-md">
                      <img src={currentUser.avatar || `https://ui-avatars.com/api/?name=${currentUser.name}`} alt="" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 dark:text-white truncate text-lg leading-tight">{currentUser.name}</p>
                      <p className="text-xs font-medium text-slate-500 truncate mt-0.5">{currentUser.email}</p>
                    </div>
                    <button onClick={logout} className="ms-2 text-slate-400 hover:text-red-500 p-2.5 transition-colors bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                      <LogIn size={20} className="rotate-180" />
                    </button>
                  </div>

                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-1">Authorized Workspaces</h3>
                  <div className="space-y-4 max-h-[40vh] overflow-y-auto pe-2 custom-scrollbar">
                    {availableOrgs && availableOrgs.length > 0 ? (
                      availableOrgs.map(org => (
                        <a
                          key={org.id}
                          href={`/${org.id}`}
                          className="group flex items-center justify-between p-5 bg-white dark:bg-slate-900/40 hover:bg-blue-600 border border-slate-100 dark:border-slate-800 rounded-2xl transition-all shadow-sm hover:shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.99]"
                        >
                          <div className="flex items-center space-x-4 rtl:space-x-reverse">
                            <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center group-hover:bg-white transition-colors shadow-inner overflow-hidden">
                              {org.logoUrl ? (
                                <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain p-1" />
                              ) : (
                                <Music size={22} className="text-slate-400 group-hover:text-blue-600 transition-colors" />
                              )}
                            </div>
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-white transition-colors text-lg">{org.name}</span>
                          </div>
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-slate-300 group-hover:text-white transition-colors">
                            <Lock size={20} />
                          </div>
                        </a>
                      ))
                    ) : (
                      <div className="text-center py-10 text-slate-400 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                        <AlertCircle className="mx-auto mb-3 opacity-20" size={40} />
                        <p className="text-sm font-medium">No authorized workspaces found.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
