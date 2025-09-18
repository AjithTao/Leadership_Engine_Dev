// Theme system with multiple beautiful themes
export interface Theme {
  name: string;
  displayName: string;
  description: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  gradients: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
  };
  shadows: {
    small: string;
    medium: string;
    large: string;
  };
}

export const themes: Record<string, Theme> = {
  // Theme 1: Ocean Breeze
  oceanBreeze: {
    name: 'oceanBreeze',
    displayName: 'Ocean Breeze',
    description: 'Calm and refreshing blue tones',
    colors: {
      primary: '#0ea5e9', // sky-500
      secondary: '#06b6d4', // cyan-500
      accent: '#8b5cf6', // violet-500
      background: '#f0f9ff', // sky-50
      surface: '#ffffff',
      text: '#0f172a', // slate-900
      textSecondary: '#64748b', // slate-500
      border: '#e2e8f0', // slate-200
      success: '#10b981', // emerald-500
      warning: '#f59e0b', // amber-500
      error: '#ef4444', // red-500
      info: '#3b82f6', // blue-500
    },
    gradients: {
      primary: 'from-sky-500 to-cyan-500',
      secondary: 'from-blue-500 to-violet-500',
      background: 'from-sky-50 to-cyan-50',
      surface: 'from-white to-sky-50',
    },
    shadows: {
      small: 'shadow-sky-200/50',
      medium: 'shadow-sky-300/50',
      large: 'shadow-sky-400/50',
    },
  },

  // Theme 2: Forest Green
  forestGreen: {
    name: 'forestGreen',
    displayName: 'Forest Green',
    description: 'Natural and earthy green tones',
    colors: {
      primary: '#059669', // emerald-600
      secondary: '#16a34a', // green-600
      accent: '#84cc16', // lime-500
      background: '#f0fdf4', // green-50
      surface: '#ffffff',
      text: '#14532d', // green-900
      textSecondary: '#65a30d', // lime-600
      border: '#bbf7d0', // green-200
      success: '#22c55e', // green-500
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-emerald-500 to-green-500',
      secondary: 'from-green-500 to-lime-500',
      background: 'from-green-50 to-emerald-50',
      surface: 'from-white to-green-50',
    },
    shadows: {
      small: 'shadow-green-200/50',
      medium: 'shadow-green-300/50',
      large: 'shadow-green-400/50',
    },
  },

  // Theme 3: Sunset Orange
  sunsetOrange: {
    name: 'sunsetOrange',
    displayName: 'Sunset Orange',
    description: 'Warm and energetic orange tones',
    colors: {
      primary: '#ea580c', // orange-600
      secondary: '#dc2626', // red-600
      accent: '#f59e0b', // amber-500
      background: '#fff7ed', // orange-50
      surface: '#ffffff',
      text: '#9a3412', // orange-800
      textSecondary: '#c2410c', // orange-600
      border: '#fed7aa', // orange-200
      success: '#16a34a', // green-600
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-orange-500 to-red-500',
      secondary: 'from-red-500 to-amber-500',
      background: 'from-orange-50 to-red-50',
      surface: 'from-white to-orange-50',
    },
    shadows: {
      small: 'shadow-orange-200/50',
      medium: 'shadow-orange-300/50',
      large: 'shadow-orange-400/50',
    },
  },

  // Theme 4: Royal Purple
  royalPurple: {
    name: 'royalPurple',
    displayName: 'Royal Purple',
    description: 'Luxurious and sophisticated purple tones',
    colors: {
      primary: '#7c3aed', // violet-600
      secondary: '#a855f7', // purple-500
      accent: '#ec4899', // pink-500
      background: '#faf5ff', // violet-50
      surface: '#ffffff',
      text: '#581c87', // violet-900
      textSecondary: '#7c3aed', // violet-600
      border: '#e9d5ff', // violet-200
      success: '#16a34a', // green-600
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-violet-500 to-purple-500',
      secondary: 'from-purple-500 to-pink-500',
      background: 'from-violet-50 to-purple-50',
      surface: 'from-white to-violet-50',
    },
    shadows: {
      small: 'shadow-violet-200/50',
      medium: 'shadow-violet-300/50',
      large: 'shadow-violet-400/50',
    },
  },

  // Theme 5: Midnight Blue
  midnightBlue: {
    name: 'midnightBlue',
    displayName: 'Midnight Blue',
    description: 'Deep and professional blue tones',
    colors: {
      primary: '#1e40af', // blue-700
      secondary: '#3730a3', // indigo-700
      accent: '#7c3aed', // violet-600
      background: '#eff6ff', // blue-50
      surface: '#ffffff',
      text: '#1e3a8a', // blue-900
      textSecondary: '#3730a3', // indigo-700
      border: '#dbeafe', // blue-200
      success: '#16a34a', // green-600
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-blue-600 to-indigo-600',
      secondary: 'from-indigo-500 to-violet-500',
      background: 'from-blue-50 to-indigo-50',
      surface: 'from-white to-blue-50',
    },
    shadows: {
      small: 'shadow-blue-200/50',
      medium: 'shadow-blue-300/50',
      large: 'shadow-blue-400/50',
    },
  },
};

// Dark mode themes
export const darkThemes: Record<string, Theme> = {
  // Dark Ocean Breeze
  oceanBreezeDark: {
    name: 'oceanBreezeDark',
    displayName: 'Ocean Breeze Dark',
    description: 'Deep ocean blues with modern dark styling',
    colors: {
      primary: '#0ea5e9', // sky-500
      secondary: '#06b6d4', // cyan-500
      accent: '#8b5cf6', // violet-500
      background: '#0f172a', // slate-900
      surface: '#1e293b', // slate-800
      text: '#f1f5f9', // slate-100
      textSecondary: '#94a3b8', // slate-400
      border: '#334155', // slate-700
      success: '#10b981', // emerald-500
      warning: '#f59e0b', // amber-500
      error: '#ef4444', // red-500
      info: '#3b82f6', // blue-500
    },
    gradients: {
      primary: 'from-sky-500 to-cyan-500',
      secondary: 'from-blue-500 to-violet-500',
      background: 'from-slate-900 to-slate-800',
      surface: 'from-slate-800 to-slate-700',
    },
    shadows: {
      small: 'shadow-slate-900/50',
      medium: 'shadow-slate-800/50',
      large: 'shadow-slate-700/50',
    },
  },

  // Dark Forest Green
  forestGreenDark: {
    name: 'forestGreenDark',
    displayName: 'Forest Green Dark',
    description: 'Deep forest greens with natural dark tones',
    colors: {
      primary: '#059669', // emerald-600
      secondary: '#16a34a', // green-600
      accent: '#84cc16', // lime-500
      background: '#0f1419', // custom dark green
      surface: '#1a2e1a', // custom dark green surface
      text: '#f0fdf4', // green-50
      textSecondary: '#86efac', // green-300
      border: '#365314', // lime-800
      success: '#22c55e', // green-500
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-emerald-500 to-green-500',
      secondary: 'from-green-500 to-lime-500',
      background: 'from-green-900 to-emerald-900',
      surface: 'from-green-800 to-emerald-800',
    },
    shadows: {
      small: 'shadow-green-900/50',
      medium: 'shadow-green-800/50',
      large: 'shadow-green-700/50',
    },
  },

  // Dark Sunset Orange
  sunsetOrangeDark: {
    name: 'sunsetOrangeDark',
    displayName: 'Sunset Orange Dark',
    description: 'Warm dark oranges with cozy atmosphere',
    colors: {
      primary: '#ea580c', // orange-600
      secondary: '#dc2626', // red-600
      accent: '#f59e0b', // amber-500
      background: '#1c1917', // custom dark orange
      surface: '#292524', // custom dark orange surface
      text: '#fff7ed', // orange-50
      textSecondary: '#fed7aa', // orange-200
      border: '#7c2d12', // orange-800
      success: '#16a34a', // green-600
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-orange-500 to-red-500',
      secondary: 'from-red-500 to-amber-500',
      background: 'from-orange-900 to-red-900',
      surface: 'from-orange-800 to-red-800',
    },
    shadows: {
      small: 'shadow-orange-900/50',
      medium: 'shadow-orange-800/50',
      large: 'shadow-orange-700/50',
    },
  },

  // Dark Royal Purple
  royalPurpleDark: {
    name: 'royalPurpleDark',
    displayName: 'Royal Purple Dark',
    description: 'Rich dark purples with luxurious feel',
    colors: {
      primary: '#7c3aed', // violet-600
      secondary: '#a855f7', // purple-500
      accent: '#ec4899', // pink-500
      background: '#1a0b2e', // custom dark purple
      surface: '#2d1b69', // custom dark purple surface
      text: '#faf5ff', // violet-50
      textSecondary: '#c4b5fd', // violet-300
      border: '#5b21b6', // violet-800
      success: '#16a34a', // green-600
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-violet-500 to-purple-500',
      secondary: 'from-purple-500 to-pink-500',
      background: 'from-violet-900 to-purple-900',
      surface: 'from-violet-800 to-purple-800',
    },
    shadows: {
      small: 'shadow-violet-900/50',
      medium: 'shadow-violet-800/50',
      large: 'shadow-violet-700/50',
    },
  },

  // Dark Midnight Blue
  midnightBlueDark: {
    name: 'midnightBlueDark',
    displayName: 'Midnight Blue Dark',
    description: 'Deep professional blues with corporate elegance',
    colors: {
      primary: '#1e40af', // blue-700
      secondary: '#3730a3', // indigo-700
      accent: '#7c3aed', // violet-600
      background: '#0f1419', // custom dark blue
      surface: '#1e293b', // slate-800
      text: '#eff6ff', // blue-50
      textSecondary: '#93c5fd', // blue-300
      border: '#1e3a8a', // blue-900
      success: '#16a34a', // green-600
      warning: '#eab308', // yellow-500
      error: '#dc2626', // red-600
      info: '#0ea5e9', // sky-500
    },
    gradients: {
      primary: 'from-blue-600 to-indigo-600',
      secondary: 'from-indigo-500 to-violet-500',
      background: 'from-blue-900 to-indigo-900',
      surface: 'from-blue-800 to-indigo-800',
    },
    shadows: {
      small: 'shadow-blue-900/50',
      medium: 'shadow-blue-800/50',
      large: 'shadow-blue-700/50',
    },
  },
};

// Theme management utilities
export const getTheme = (themeName: string, isDark: boolean = false): Theme => {
  const themeKey = isDark ? `${themeName}Dark` : themeName;
  const theme = isDark ? darkThemes[themeKey] : themes[themeName];
  
  if (!theme) {
    // Fallback to default theme
    return isDark ? darkThemes.oceanBreezeDark : themes.oceanBreeze;
  }
  
  return theme;
};

export const getAllThemes = (isDark: boolean = false): Theme[] => {
  const themeList = isDark ? darkThemes : themes;
  return Object.values(themeList);
};

export const getThemeNames = (isDark: boolean = false): string[] => {
  const themeList = isDark ? darkThemes : themes;
  return Object.keys(themeList);
};

// CSS Custom Properties generator
export const generateThemeCSS = (theme: Theme): string => {
  return `
    :root {
      --color-primary: ${theme.colors.primary};
      --color-secondary: ${theme.colors.secondary};
      --color-accent: ${theme.colors.accent};
      --color-background: ${theme.colors.background};
      --color-surface: ${theme.colors.surface};
      --color-text: ${theme.colors.text};
      --color-text-secondary: ${theme.colors.textSecondary};
      --color-border: ${theme.colors.border};
      --color-success: ${theme.colors.success};
      --color-warning: ${theme.colors.warning};
      --color-error: ${theme.colors.error};
      --color-info: ${theme.colors.info};
      
      --gradient-primary: ${theme.gradients.primary};
      --gradient-secondary: ${theme.gradients.secondary};
      --gradient-background: ${theme.gradients.background};
      --gradient-surface: ${theme.gradients.surface};
      
      --shadow-small: ${theme.shadows.small};
      --shadow-medium: ${theme.shadows.medium};
      --shadow-large: ${theme.shadows.large};
    }
  `;
};
