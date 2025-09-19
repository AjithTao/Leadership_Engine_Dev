'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme, getTheme, getAllThemes, generateThemeCSS } from '../utils/themes';

interface ThemeContextType {
  currentTheme: Theme;
  isDarkMode: boolean;
  themeName: string;
  setTheme: (themeName: string) => void;
  toggleDarkMode: () => void;
  availableThemes: Theme[];
  isThemeLoaded: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [themeName, setThemeName] = useState<string>('modernCorporate');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [isThemeLoaded, setIsThemeLoaded] = useState<boolean>(false);

  // Load theme preferences from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('selectedTheme');
    const savedDarkMode = localStorage.getItem('isDarkMode');
    
    if (savedTheme) {
      setThemeName(savedTheme);
    }
    if (savedDarkMode !== null) {
      setIsDarkMode(JSON.parse(savedDarkMode));
    }
    
    // Mark theme as loaded
    setIsThemeLoaded(true);
  }, []);

  // Get current theme - ensure new object reference for React re-renders
  const currentTheme = React.useMemo(() => getTheme(themeName, isDarkMode), [themeName, isDarkMode]);
  const availableThemes = getAllThemes(isDarkMode);

  // Apply theme CSS to document
  useEffect(() => {
    const themeCSS = generateThemeCSS(currentTheme);
    
    // Remove existing theme style
    const existingStyle = document.getElementById('theme-styles');
    if (existingStyle) {
      existingStyle.remove();
    }
    
    // Add new theme style
    const style = document.createElement('style');
    style.id = 'theme-styles';
    style.textContent = themeCSS;
    document.head.appendChild(style);
    
    // Update document class for dark mode
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [currentTheme, isDarkMode]);

  const setTheme = (newThemeName: string) => {
    setThemeName(newThemeName);
    localStorage.setItem('selectedTheme', newThemeName);
  };

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('isDarkMode', JSON.stringify(newDarkMode));
  };

  const value: ThemeContextType = {
    currentTheme,
    isDarkMode,
    themeName,
    setTheme,
    toggleDarkMode,
    availableThemes,
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