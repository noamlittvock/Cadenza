import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  // 3. Gateway / Workspace Selector
  if (!orgSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-44 h-44 mx-auto mb-6 drop-shadow-2xl rounded-[2.5rem] overflow-hidden">
              <img src="/logo.png?v=2" alt="Cadenza Logo" className="w-full h-full object-cover" />
            </div>
            <img src="/logo_text.png" alt="Cadenza" className="h-[72px] mx-auto mb-3 object-contain" />
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-8">
              {loading ? (
                /* Loading State — shown immediately after popup closes while Firestore resolves */
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mb-4"></div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Signing you in...</p>
                </div>
              ) : !currentUser ? (
                <>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 text-center">Sign in to continue</h2>
                  <button
                    onClick={login}
                    className="w-full flex items-center justify-center space-x-3 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white py-4 px-4 rounded-xl font-semibold transition-all shadow-lg active:scale-[0.98]"
                  >
                    <LogIn size={20} />
                    <span>Sign In with Google</span>
                  </button>
                  {errorMsg && <p className="mt-4 text-center text-red-500 text-sm">{errorMsg}</p>}
                </>
              ) : (
                <>
                  <div className="flex items-center space-x-4 mb-8 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-white dark:border-slate-700">
                      <img src={currentUser.avatar || `https://ui-avatars.com/api/?name=${currentUser.name}`} alt="" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
                      <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                    </div>
                    <button onClick={logout} className="ml-auto text-slate-400 hover:text-red-500 p-2 transition-colors">
                      <LogIn size={18} className="rotate-180" />
                    </button>
                  </div>

                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 px-1">Your Workspaces</h3>
                  <div className="space-y-3">
                    {availableOrgs && availableOrgs.length > 0 ? (
                      availableOrgs.map(org => (
                        <a
                          key={org.id}
                          href={`/${org.id}`}
                          className="group flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800 rounded-xl transition-all"
                        >
                          <div className="flex items-center space-x-3 text-slate-900">
                            <div className="w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center group-hover:bg-blue-600 transition-colors shadow-sm overflow-hidden">
                              {org.logoUrl ? (
                                <img src={org.logoUrl} alt={org.name} className="w-full h-full object-contain" />
                              ) : (
                                <Music size={18} className="text-slate-500 group-hover:text-white" />
                              )}
                            </div>
                            <span className="font-bold dark:text-white">{org.name}</span>
                          </div>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-colors">
                            <Lock size={16} />
                          </div>
                        </a>
                      ))
                    ) : (
                      <div className="text-center py-6 text-slate-400">
                        <AlertCircle className="mx-auto mb-2 opacity-20" size={32} />
                        <p className="text-sm">No authorized workspaces found.</p>
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
