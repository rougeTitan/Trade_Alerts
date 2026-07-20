import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = '@trade_alerts_auth';

const DEMO_USER = {
  id: 'demo-1',
  name: 'Trade Alerts User',
  email: 'user@tradealerts.io',
  avatar: 'https://api.dicebear.com/7.x/initials/png?seed=Trade%20Alerts&backgroundColor=4d8b31',
};

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY)
      .then((saved) => {
        if (saved) setUser(JSON.parse(saved));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (overrides = {}) => {
    const nextUser = { ...DEMO_USER, ...overrides };
    setUser(nextUser);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(nextUser));
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem(AUTH_KEY);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { DEMO_USER };
