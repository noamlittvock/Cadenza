import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, googleProvider, db } from '../utils/firebase';
import { Lock, LogIn, AlertCircle, Loader2, Music } from 'lucide-react';

export type UserRole = 'ADMIN' | 'VIEWER';

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
}

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  orgId: string | null;
  availableOrgs: OrgInfo[] | null;
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

// Bootstrap admin email for the first time setup
const BOOTSTRAP_ADMIN_EMAIL = 'noam.littvock@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableOrgs, setAvailableOrgs] = useState<OrgInfo[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extract orgSlug from the URL path (e.g., /alpert -> alpert)
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const orgSlug = pathParts[0] || null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.email) {
        const normalizedEmail = firebaseUser.email.toLowerCase().trim();
        const BOOTSTRAP_EMAIL_NORMALIZED = BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim();

        try {
          if (orgSlug) {
            // SCENARIO A: User is trying to access a specific organization URL
            const userDocRef = doc(db, 'access_control', firebaseUser.email);
            const userDoc = await getDoc(userDocRef);

            console.log("Auth Check:", { email: normalizedEmail, orgSlug, docExists: userDoc.exists() });

            if (userDoc.exists() && userDoc.data()?.allowed === true && userDoc.data()?.orgId === orgSlug) {
              setCurrentUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'User',
                email: firebaseUser.email,
                role: userDoc.data()?.role || 'VIEWER',
                avatar: firebaseUser.photoURL || undefined,
                orgId: orgSlug
              });
              setErrorMsg(null);
            } else if (normalizedEmail === BOOTSTRAP_EMAIL_NORMALIZED) {
              // Bootstrap Protocol
              await setDoc(userDocRef, {
                email: normalizedEmail,
                allowed: true,
                role: 'ADMIN',
                orgId: orgSlug,
                createdAt: new Date().toISOString()
              }, { merge: true });

              setCurrentUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'Administrator',
                email: firebaseUser.email,
                role: 'ADMIN',
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
          } else {
            // SCENARIO B: User is at the root ("Gateway")
            // Fetch all organizations this user is allowed to access
            const q = query(
              collection(db, 'access_control'),
              where('email', '==', normalizedEmail),
              where('allowed', '==', true)
            );
            const querySnapshot = await getDocs(q);

            const myOrgsRaw = querySnapshot.docs.map(d => d.data().orgId);

            if (myOrgsRaw.length === 0 && normalizedEmail !== BOOTSTRAP_EMAIL_NORMALIZED) {
              setErrorMsg("No workspaces found for your account.");
              setAvailableOrgs([]);
            } else if (myOrgsRaw.length === 1 && normalizedEmail !== BOOTSTRAP_EMAIL_NORMALIZED) {
              // Auto-redirect if only one org found (UX optimization)
              window.location.href = `/${myOrgsRaw[0]}`;
              return;
            } else {
              // Fetch organization names
              const orgsWithNames: OrgInfo[] = [];
              for (const slug of myOrgsRaw) {
                const oDoc = await getDoc(doc(db, 'organizations', slug));
                orgsWithNames.push({ id: slug, name: oDoc.exists() ? oDoc.data().name : slug });
              }

              setAvailableOrgs(orgsWithNames);

              // Set a "root" user profile for the selector UI
              setCurrentUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'Authorized User',
                email: firebaseUser.email,
                role: 'VIEWER', // Default at root
                avatar: firebaseUser.photoURL || undefined,
                orgId: '' // No org active yet
              });

              // If it's you (the boss), show a generic placeholder if you haven't visited any yet
              if (normalizedEmail === BOOTSTRAP_EMAIL_NORMALIZED && orgsWithNames.length === 0) {
                setAvailableOrgs([{ id: 'alpert', name: 'Alpert Music Center' }]);
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
      await signInWithPopup(auth, googleProvider);
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
    if (orgSlug) {
      window.location.href = '/';
    }
  };

  const value = {
    currentUser,
    isAdmin: currentUser?.role === 'ADMIN',
    orgId: currentUser?.orgId || null,
    availableOrgs,
    login,
    logout
  };

  // 3. Gateway / Workspace Selector
  if (!orgSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-blue-500 rounded-3xl flex items-center justify-center text-white mx-auto mb-6 shadow-lg shadow-blue-500/20">
              <Music size={40} />
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-3">Cadenza</h1>
            <p className="text-slate-500 dark:text-slate-400">Welcome to the Music Center Management Platform</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-8">
              {!currentUser ? (
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
                            <div className="w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm">
                              <Music size={18} />
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

            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 border-t border-slate-100 dark:border-slate-700">
              <p className="text-center text-xs text-slate-500 mb-1">Authenticated via Google Cloud Identity</p>
              <p className="text-center text-[10px] text-slate-400">Cadenza Multi-Tenant v1.0 • Built by Antigravity</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
