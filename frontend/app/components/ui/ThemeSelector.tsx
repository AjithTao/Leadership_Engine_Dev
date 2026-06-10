'use client'

// ThemeSelector removed — CDK Intelligent Suite uses a single palette
// with only light/dark mode toggle (Sun/Moon in the header).
// This stub is kept so existing imports don't break at the module level.

interface ThemeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeSelector: React.FC<ThemeSelectorProps> = () => null;

import React from 'react';
export default ThemeSelector;
