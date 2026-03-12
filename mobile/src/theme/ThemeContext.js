import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkTheme, lightTheme } from './themes';

const ThemeContext = createContext({
  theme: darkTheme,
  isDark: true,
  toggleTheme: () => {},
});

const THEME_KEY = '@trade_alerts_theme';

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Load saved theme - fallback to system preference
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved !== null) {
        setIsDark(saved === 'dark');
      } else {
        setIsDark(systemScheme !== 'light');
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
      return next;
    });
  }, []);

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
