import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../utils/firebase';
import { Lock, LogIn, AlertCircle, Loader2 } from 'lucide-react';

export type UserRole = 'ADMIN' | 'VIEWER';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
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
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser?.email) {
        try {
          const userDocRef = doc(db, 'access_control', firebaseUser.email);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists() && userDoc.data()?.allowed === true) {
            setCurrentUser({
              id: firebaseUser.uid,
              name: firebaseUser.displayName || 'User',
              email: firebaseUser.email,
              role: userDoc.data()?.role || 'VIEWER',
              avatar: firebaseUser.photoURL || undefined
            });
            setErrorMsg(null);
          } else if (!userDoc.exists() && firebaseUser.email === BOOTSTRAP_ADMIN_EMAIL) {
            // Bootstrap Protocol: Auto-allow to initialize
            await setDoc(userDocRef, {
              allowed: true,
              role: 'ADMIN',
              createdAt: new Date().toISOString()
            });
            setCurrentUser({
              id: firebaseUser.uid,
              name: firebaseUser.displayName || 'Administrator',
              email: firebaseUser.email,
              role: 'ADMIN',
              avatar: firebaseUser.photoURL || undefined
            });
            setErrorMsg(null);
          } else {
            // Unauthorized
            await signOut(auth);
            setCurrentUser(null);
            setErrorMsg("Your account currently does not have access to this system.");
          }
        } catch (error) {
          console.error("Auth Error:", error);
          setErrorMsg("Error verifying access permissions.");
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

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
  };

  const value = {
    currentUser,
    isAdmin: currentUser?.role === 'ADMIN',
    login,
    logout
  };

  // The Access Gate Rendering
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center text-slate-400">
          <Loader2 className="animate-spin mb-4" size={32} />
          <p>Verifying Access...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
        <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="p-8 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
              <Lock size={28} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Music Center Portal
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-xs">
              This is a secure area. You must be granted explicit access to view or manage the schedule.
            </p>

            {errorMsg && (
              <div className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6 flex items-start text-left border border-red-100 dark:border-red-900/30">
                <AlertCircle className="w-5 h-5 shrink-0 mr-2 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              onClick={login}
              className="w-full flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-all shadow-md active:scale-[0.98]"
            >
              <LogIn size={18} />
              <span>Sign In with Google</span>
            </button>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-100 dark:border-slate-700 text-center text-xs text-slate-500">
            Secure connection via Firebase Auth
          </div>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
