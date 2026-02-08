import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'ADMIN' | 'VIEWER';

interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  login: (role: UserRole) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Initial mock users
const ADMIN_USER: User = {
  id: 'admin-1',
  name: 'Administrator',
  role: 'ADMIN',
  avatar: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff'
};

const VIEWER_USER: User = {
  id: 'viewer-1',
  name: 'Guest Viewer',
  role: 'VIEWER',
  avatar: 'https://ui-avatars.com/api/?name=Guest&background=636e72&color=fff'
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // Persist session to local storage for dev convenience
    const stored = localStorage.getItem('auth_user');
    return stored ? JSON.parse(stored) : ADMIN_USER;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('auth_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('auth_user');
    }
  }, [currentUser]);

  const login = (role: UserRole) => {
    setCurrentUser(role === 'ADMIN' ? ADMIN_USER : VIEWER_USER);
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    isAdmin: currentUser?.role === 'ADMIN',
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
