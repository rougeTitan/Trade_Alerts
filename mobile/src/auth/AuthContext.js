import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CognitoUserPool,
  CognitoUserAttribute,
  CognitoUser,
  AuthenticationDetails,
  CognitoIdToken,
} from 'amazon-cognito-identity-js';

const AUTH_KEY = '@trade_alerts_auth';
const TOKEN_KEY = '@trade_alerts_token';
const LOGIN_TIME_KEY = '@trade_alerts_login_time';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const COGNITO_REGION = process.env.EXPO_PUBLIC_COGNITO_REGION || '';
const COGNITO_POOL_ID = process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || '';
const COGNITO_CONFIGURED = COGNITO_REGION && COGNITO_POOL_ID && COGNITO_CLIENT_ID;

const COGNITO_DOMAIN = `cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_POOL_ID}`;
const pool = COGNITO_CONFIGURED
  ? new CognitoUserPool({
      UserPoolId: COGNITO_POOL_ID,
      ClientId: COGNITO_CLIENT_ID,
    })
  : null;

const DEMO_USER = {
  id: 'demo-1',
  name: 'Trade Alerts User',
  email: 'user@tradealerts.io',
  avatar: 'https://api.dicebear.com/7.x/initials/png?seed=Trade%20Alerts&backgroundColor=4d8b31',
};

export async function getIdToken() {
  if (!COGNITO_CONFIGURED) return 'demo-token';
  const current = pool.getCurrentUser();

  const loginTime = await AsyncStorage.getItem(LOGIN_TIME_KEY);
  if (loginTime && Date.now() - Number(loginTime) > SESSION_TTL_MS) {
    console.warn('Session expired after 24 hours');
    current?.signOut();
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(AUTH_KEY);
    await AsyncStorage.removeItem(LOGIN_TIME_KEY);
    return null;
  }

  const _cachedToken = async () => {
    const cached = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
    if (!cached) return null;
    try {
      const idToken = new CognitoIdToken({ IdToken: cached });
      const claims = idToken.decodePayload();
      if (!claims) return null;
      const expectedIss = `https://${COGNITO_DOMAIN}`;
      if (claims.iss !== expectedIss || claims.aud !== COGNITO_CLIENT_ID) return null;
      if (Date.now() >= claims.exp * 1000) return null;
      return cached;
    } catch (e) {
      return null;
    }
  };

  if (!current) return _cachedToken();

  return new Promise((resolve) => {
    current.getSession(async (err, session) => {
      if (!err && session && session.isValid()) {
        const claims = session.getIdToken().decodePayload();
        const expectedIss = `https://${COGNITO_DOMAIN}`;
        if (claims.iss === expectedIss && claims.aud === COGNITO_CLIENT_ID) {
          const token = session.getIdToken().getJwtToken();
          await AsyncStorage.setItem(TOKEN_KEY, token);
          resolve(token);
          return;
        }
      }

      const cached = await _cachedToken();
      if (cached) {
        resolve(cached);
        return;
      }

      console.warn('Cognito session invalid, clearing');
      current?.signOut();
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(AUTH_KEY);
      await AsyncStorage.removeItem(LOGIN_TIME_KEY);
      resolve(null);
    });
  });
}

function _promisify(fn) {
  return new Promise((resolve, reject) => {
    fn((err, result) => (err ? reject(err) : resolve(result)));
  });
}

function _wrapCognito(fn) {
  return new Promise((resolve, reject) => {
    fn({
      onSuccess: (result) => resolve(result),
      onFailure: (err) => reject(err),
      newPasswordRequired: () => reject(new Error('New password required')),
    });
  });
}

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  signUp: async () => {},
  confirmSignUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  getIdToken: async () => null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const _setUserFromClaims = useCallback(async (claims, token) => {
    const nextUser = {
      id: claims.sub,
      email: claims.email,
      name: claims.name || claims.email?.split('@')[0] || 'User',
      avatar: `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(
        claims.name || claims.email
      )}&backgroundColor=4d8b31`,
    };
    setUser(nextUser);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(nextUser));
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(LOGIN_TIME_KEY, String(Date.now()));
    return nextUser;
  }, []);

  useEffect(() => {
    (async () => {
      const loginTime = await AsyncStorage.getItem(LOGIN_TIME_KEY);
      if (loginTime && Date.now() - Number(loginTime) > SESSION_TTL_MS) {
        console.warn('Session expired after 24 hours');
        await signOut();
        setLoading(false);
        return;
      }

      if (!COGNITO_CONFIGURED) {
        AsyncStorage.getItem(AUTH_KEY)
          .then((saved) => {
            if (saved) setUser(JSON.parse(saved));
          })
          .catch(() => {})
          .finally(() => setLoading(false));
        return;
      }

      const _userFromCached = async () => {
        const cached = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
        if (!cached) return false;
        try {
          const idToken = new CognitoIdToken({ IdToken: cached });
          const claims = idToken.decodePayload();
          if (!claims) return false;
          const expectedIss = `https://${COGNITO_DOMAIN}`;
          if (claims.iss !== expectedIss || claims.aud !== COGNITO_CLIENT_ID) return false;
          if (Date.now() >= claims.exp * 1000) return false;
          await _setUserFromClaims(claims, cached);
          return true;
        } catch (e) {
          return false;
        }
      };

      const current = pool.getCurrentUser();
      if (!current) {
        if (await _userFromCached()) {
          setLoading(false);
          return;
        }
        setLoading(false);
        return;
      }

      current.getSession(async (err, session) => {
        if (err || !session || !session.isValid()) {
          if (await _userFromCached()) {
            setLoading(false);
            return;
          }
          setLoading(false);
          return;
        }
        const idToken = session.getIdToken().getJwtToken();
        const claims = session.getIdToken().decodePayload();
        const expectedIss = `https://${COGNITO_DOMAIN}`;
        if (claims.iss !== expectedIss || claims.aud !== COGNITO_CLIENT_ID) {
          console.warn('Cognito session does not match current pool, clearing');
          current.signOut();
          await AsyncStorage.removeItem(AUTH_KEY).catch(() => {});
          await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
          await AsyncStorage.removeItem(LOGIN_TIME_KEY).catch(() => {});
          setUser(null);
          setLoading(false);
          return;
        }
        _setUserFromClaims(claims, idToken).finally(() => setLoading(false));
      });
    })();
  }, [_setUserFromClaims]);

  const signUp = useCallback(async ({ email, password, name }) => {
    if (!COGNITO_CONFIGURED) throw new Error('Cognito not configured');
    const attrs = [
      new CognitoUserAttribute({ Name: 'name', Value: name || email.split('@')[0] }),
    ];
    const result = await _promisify((cb) => pool.signUp(email, password, attrs, null, cb));
    return result;
  }, []);

  const confirmSignUp = useCallback(async (email, code) => {
    if (!COGNITO_CONFIGURED) throw new Error('Cognito not configured');
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: pool,
    });
    await _promisify((cb) => cognitoUser.confirmRegistration(code, true, cb));
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    if (!COGNITO_CONFIGURED) {
      // Demo fallback — keep old mock for local dev.
      setUser(DEMO_USER);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(DEMO_USER));
      return DEMO_USER;
    }

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: pool,
    });
    const auth = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const session = await _wrapCognito((cb) => cognitoUser.authenticateUser(auth, cb));
    const idToken = session.getIdToken().getJwtToken();
    const claims = session.getIdToken().decodePayload();
    return _setUserFromClaims(claims, idToken);
  }, [_setUserFromClaims]);

  const signOut = useCallback(async () => {
    const current = pool?.getCurrentUser();
    current?.signOut();
    setUser(null);
    await AsyncStorage.removeItem(AUTH_KEY);
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(LOGIN_TIME_KEY);
  }, []);

  const login = useCallback(async (overrides = {}) => {
    if (!COGNITO_CONFIGURED) {
      const nextUser = { ...DEMO_USER, ...overrides };
      setUser(nextUser);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(nextUser));
      return nextUser;
    }
    return signIn(overrides);
  }, [signIn]);

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    signUp,
    confirmSignUp,
    signIn,
    signOut,
    login,
    logout: signOut,
    getIdToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { COGNITO_CONFIGURED, COGNITO_DOMAIN, DEMO_USER };
