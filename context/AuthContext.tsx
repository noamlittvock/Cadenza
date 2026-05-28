import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, googleProvider, db } from '../utils/firebase';
import { Lock, LogIn, AlertCircle, Loader2, Music } from 'lucide-react';

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'VIEWER';

interface User {
  id: string;
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

// Superadmin email – has access to all tenants, sandbox, and superadmin tools
// This is hardcoded and not editable through any UI. Firebase is the only place this could ever change.
const SUPERADMIN_EMAIL = 'noam.littvock@gmail.com';

// ─── E2E Auth Bypass ─────────────────────────────────────────────────────────
// When VITE_E2E_AUTH_BYPASS=true (set via .env.e2e), skip all Firebase auth
// and inject a mock SuperAdmin user so Playwright tests can run without OAuth.
const E2EAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const mockOrgId = pathParts[0] || 'test-org';
  const mockValue: AuthContextType = {
    currentUser: { id: 'e2e-uid', name: 'E2E Admin', email: 'e2e@cadenza.test', role: 'SUPERADMIN', orgId: mockOrgId },
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.email) {
        const normalizedEmail = firebaseUser.email.toLowerCase().trim();
        const SUPERADMIN_EMAIL_NORMALIZED = SUPERADMIN_EMAIL.toLowerCase().trim();
        const isSuperAdminUser = normalizedEmail === SUPERADMIN_EMAIL_NORMALIZED;

        try {
          if (orgSlug) {
            // SCENARIO A: User is trying to access a specific organization URL
            // First check the new composite ID format (email_orgSlug)
            const compositeId = `${normalizedEmail}_${orgSlug}`;
            const compositeDocRef = doc(db, 'access_control', compositeId);
            const compositeDoc = await getDoc(compositeDocRef);

            // Backup check for legacy documents (where ID is exactly the email)
            const legacyDocRef = doc(db, 'access_control', normalizedEmail);
            const legacyDoc = await getDoc(legacyDocRef);

            let validDoc = null;
            if (compositeDoc.exists() && compositeDoc.data()?.allowed === true && compositeDoc.data()?.orgId === orgSlug) {
              validDoc = compositeDoc;
            } else if (legacyDoc.exists() && legacyDoc.data()?.allowed === true && legacyDoc.data()?.orgId === orgSlug) {
              validDoc = legacyDoc;
            }

            console.log("Auth Check:", { email: normalizedEmail, orgSlug, docExists: !!validDoc });

            if (validDoc) {
              // If this is the superadmin, always assign SUPERADMIN role regardless of what's in the doc
              const resolvedRole: UserRole = isSuperAdminUser ? 'SUPERADMIN' : (validDoc.data()?.role || 'VIEWER');

              // Bridge: provision userProfiles/{uid} from access_control so v2
              // collection reads unlock immediately, then claim/create the staff
              // record. Order matters — staff queries are denied until userProfile
              // exists. Skip for superadmin — isSuperAdmin() rules short-circuit.
              if (!isSuperAdminUser) {
                const nowIso = new Date().toISOString();

                // Step 1: write userProfiles/{firebaseUser.uid} from access_control role.
                // Rules constrain role/orgId to match access_control, so we can't elevate.
                try {
                  await setDoc(doc(db, 'userProfiles', firebaseUser.uid), {
                    uid: firebaseUser.uid,
                    orgId: orgSlug,
                    role: resolvedRole,
                    staffMemberId: '',
                  }, { merge: true });
                } catch (profileErr) {
                  console.error('[AuthContext] userProfile self-write failed', profileErr);
                }

                // Step 2: claim or create the staff record. Now that userProfiles
                // exists, isAuthenticatedForOrgV2() passes and these reads/writes work.
                try {
                  const staffSnap = await getDocs(query(
                    collection(db, 'staffMembers'),
                    where('orgId', '==', orgSlug),
                    where('email', '==', normalizedEmail),
                    limit(1)
                  ));
                  if (!staffSnap.empty) {
                    const staffDoc = staffSnap.docs[0];
                    if (staffDoc.data().uid !== firebaseUser.uid) {
                      await updateDoc(staffDoc.ref, { uid: firebaseUser.uid, updatedAt: nowIso });
                    }
                  } else {
                    await addDoc(collection(db, 'staffMembers'), {
                      orgId: orgSlug,
                      uid: firebaseUser.uid,
                      email: normalizedEmail,
                      fullName: firebaseUser.displayName || normalizedEmail,
                      role: resolvedRole === 'VIEWER' ? 'STAFF' : resolvedRole,
                      phone: null,
                      startDate: null,
                      isArchived: false,
                      createdAt: nowIso,
                      updatedAt: nowIso,
                      isFirstAdmin: resolvedRole === 'ADMIN',
                      onboardingDismissed: false,
                      firstUseFlags: { activityHub: false, staffModule: false, eventCreation: false, enrollment: false },
                      documents: [],
                    });
                  }
                } catch (bridgeErr) {
                  console.error('[AuthContext] staff bridge failed', bridgeErr);
                }
              }

              setCurrentUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'User',
                email: firebaseUser.email,
                role: resolvedRole,
                avatar: firebaseUser.photoURL || undefined,
                orgId: orgSlug
              });
              setErrorMsg(null);
            } else if (isSuperAdminUser) {
              // Superadmin Automatic Bypass & Provisioning
              await setDoc(compositeDocRef, {
                email: normalizedEmail,
                allowed: true,
                role: 'ADMIN',
                orgId: orgSlug,
                createdAt: new Date().toISOString()
              }, { merge: true });

              setCurrentUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'Super Administrator',
                email: firebaseUser.email,
                role: 'SUPERADMIN',
                avatar: firebaseUser.photoURL || undefined,
                orgId: orgSlug
              });

              await setDoc(doc(db, 'organizations', orgSlug), {
                name: orgSlug.charAt(0).toUpperCase() + orgSlug.slice(1),
                createdAt: new Date().toISOString()
              }, { merge: true });

              setErrorMsg(null);
            } else {
              await signOut(auth);
              setCurrentUser(null);
              setErrorMsg(`Your account does not have access to the '${orgSlug}' workspace.`);
            }

            if (validDoc || isSuperAdminUser) {
              try {
                const oDoc = await getDoc(doc(db, 'organizations', orgSlug));
                const orgName = oDoc.exists() ? oDoc.data().name : orgSlug.charAt(0).toUpperCase() + orgSlug.slice(1);
                const orgLogo = oDoc.exists() ? oDoc.data().logoUrl : undefined;
                setAvailableOrgs([{ id: orgSlug, name: orgName, logoUrl: orgLogo }]);
              } catch (e) {
                console.error("Failed to load organization metadata", e);
                setAvailableOrgs([{ id: orgSlug, name: orgSlug.charAt(0).toUpperCase() + orgSlug.slice(1) }]);
              }
            }
          } else {
            // SCENARIO B: User is at the root ("Gateway")
            let myOrgsRaw: string[] = [];

            if (isSuperAdminUser) {
              // Superadmin: Get ALL organizations + sandbox
              const allOrgsSnap = await getDocs(collection(db, 'organizations'));
              myOrgsRaw = allOrgsSnap.docs.map(d => d.id);

              // Ensure sandbox is always available for superadmin
              if (!myOrgsRaw.includes('sandbox')) myOrgsRaw.push('sandbox');
            } else {
              // Regular users: only see orgs they have explicit access to
              const q = query(
                collection(db, 'access_control'),
                where('email', '==', normalizedEmail),
                where('allowed', '==', true)
              );
              const querySnapshot = await getDocs(q);
              myOrgsRaw = querySnapshot.docs.map(d => d.data().orgId);

              // Also check for a legacy record (where ID is just the email)
              const legacyDoc = await getDoc(doc(db, 'access_control', normalizedEmail));
              if (legacyDoc.exists() && legacyDoc.data().allowed && legacyDoc.data().orgId) {
                myOrgsRaw.push(legacyDoc.data().orgId);
              }
            }

            // Deduplicate slugs
            myOrgsRaw = [...new Set(myOrgsRaw)];

            if (myOrgsRaw.length === 0 && !isSuperAdminUser) {
              setErrorMsg("No workspaces found for your account.");
              setAvailableOrgs([]);
            } else {
              // Fetch organization names
              const orgsWithNames: OrgInfo[] = [];
              for (const slug of myOrgsRaw) {
                const oDoc = await getDoc(doc(db, 'organizations', slug));
                orgsWithNames.push({
                  id: slug,
                  name: oDoc.exists() ? oDoc.data().name : slug,
                  logoUrl: oDoc.exists() ? oDoc.data().logoUrl : undefined
                });
              }

              setAvailableOrgs(orgsWithNames);

              // Set a "root" user profile for the selector UI
              setCurrentUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'Authorized User',
                email: firebaseUser.email,
                role: isSuperAdminUser ? 'SUPERADMIN' : 'VIEWER',
                avatar: firebaseUser.photoURL || undefined,
                orgId: '' // No org active yet
              });

              // Superadmin: always ensure sandbox environment is in the list
              if (isSuperAdminUser) {
                setAvailableOrgs(prev => {
                  const existing = prev || [];
                  if (!existing.find(o => o.id === 'sandbox')) {
                    return [...existing, { id: 'sandbox', name: 'Sandbox (Dev)', logoUrl: undefined }];
                  }
                  return existing;
                });
              }
            }
          }
        } catch (error) {
          console.error("Auth Error:", error);
          setErrorMsg("Error verifying access permissions.");
        }
      } else {
        setCurrentUser(null);
        setAvailableOrgs(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [orgSlug]);

  const login = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);

      // Capture the Google Access Token for Calendar operations
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        setGoogleAccessToken(credential.accessToken);
        sessionStorage.setItem('gcal_token', credential.accessToken);
      }

    } catch (err: any) {
      console.error(err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMsg("Failed to sign in. Please try again.");
      }
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
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
