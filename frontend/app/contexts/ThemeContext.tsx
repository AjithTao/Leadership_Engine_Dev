'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Theme, getTheme } from '../utils/themes';

interface ThemeContextType {
  currentTheme: Theme;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isThemeLoaded: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'falconx-theme';
const TRANSITION_CLASS = 'theme-transitioning';
const TRANSITION_DURATION = 300; // ms — matches CSS transition durations

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isThemeLoaded, setIsThemeLoaded] = useState<boolean>(false);

  // On mount: read persisted preference (default: dark)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefersDark = stored !== null
      ? stored === 'dark'
      : true; // FalconX default is dark

    applyTheme(prefersDark);
    setIsDarkMode(prefersDark);
    setIsThemeLoaded(true);
  }, []);

  const currentTheme = React.useMemo(() => getTheme('cdk', isDarkMode), [isDarkMode]);

  /** Toggle between dark and light with a smooth CSS transition burst */
  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => {
      const next = !prev;

      // Briefly add transition class so CSS picks up all color changes smoothly
      document.documentElement.classList.add(TRANSITION_CLASS);
      applyTheme(next);
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');

      setTimeout(() => {
        document.documentElement.classList.remove(TRANSITION_CLASS);
      }, TRANSITION_DURATION);

      return next;
    });
  }, []);

  const value: ThemeContextType = {
    currentTheme,
    isDarkMode,
    toggleDarkMode,
    isThemeLoaded,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Apply (or remove) the .dark class on <html> — all CSS vars follow automatically. */
function applyTheme(dark: boolean) {
  if (dark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
