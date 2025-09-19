// Theme system with 6 beautiful professional themes
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
  // Theme 1: Current UI (Orange/Black/White) - Default
  currentUI: {
    name: 'currentUI',
    displayName: 'Current UI',
    description: 'The original orange, black, and white design',
    colors: {
      primary: '#FF4500', // Orange Red
      secondary: '#E03E00', // Darker Orange
      accent: '#FF6B35', // Lighter Orange
      background: '#FFFFFF', // Pure White
      surface: '#F8F9FA', // Light Gray
      text: '#000000', // Pure Black
      textSecondary: '#6B7280', // Gray
      border: '#E5E7EB', // Light Gray Border
      success: '#10B981', // Green
      warning: '#F59E0B', // Amber
      error: '#EF4444', // Red
      info: '#3B82F6', // Blue
    },
    gradients: {
      primary: 'from-[#FF4500] to-[#E03E00]',
      secondary: 'from-[#FF6B35] to-[#FF4500]',
      background: 'from-white to-gray-50',
      surface: 'from-white to-gray-100',
    },
    shadows: {
      small: 'shadow-gray-200/50',
      medium: 'shadow-gray-300/50',
      large: 'shadow-gray-400/50',
    },
  },

  // Theme 2: Warm Professional
  warmProfessional: {
    name: 'warmProfessional',
    displayName: 'Warm Professional',
    description: 'Deep navy blue with soft orange accents',
    colors: {
      primary: '#1E3A8A', // Deep Navy Blue
      secondary: '#F97316', // Soft Orange
      accent: '#6B7280', // Warm Gray
      background: '#FAFAFA', // Off-white
      surface: '#F8FAFC', // Light Blue-tinted White
      text: '#1F2937', // Dark Gray (instead of black)
      textSecondary: '#4B5563', // Medium Gray
      border: '#E5E7EB', // Light Gray Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#1E3A8A] to-[#1E40AF]',
      secondary: 'from-[#F97316] to-[#EA580C]',
      background: 'from-[#FAFAFA] to-[#F8FAFC]',
      surface: 'from-white to-[#F8FAFC]',
    },
    shadows: {
      small: 'shadow-blue-200/50',
      medium: 'shadow-blue-300/50',
      large: 'shadow-blue-400/50',
    },
  },

  // Theme 3: Modern Corporate
  modernCorporate: {
    name: 'modernCorporate',
    displayName: 'Modern Corporate',
    description: 'Slate blue with coral accents for professional appeal',
    colors: {
      primary: '#475569', // Slate Blue
      secondary: '#F87171', // Coral
      accent: '#374151', // Charcoal
      background: '#F1F5F9', // Light Gray
      surface: '#E2E8F0', // Slate Gray
      text: '#1F2937', // Dark Gray
      textSecondary: '#4B5563', // Medium Gray
      border: '#CBD5E1', // Slate Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#475569] to-[#334155]',
      secondary: 'from-[#F87171] to-[#EF4444]',
      background: 'from-[#F1F5F9] to-[#E2E8F0]',
      surface: 'from-[#E2E8F0] to-[#CBD5E1]',
    },
    shadows: {
      small: 'shadow-slate-200/50',
      medium: 'shadow-slate-300/50',
      large: 'shadow-slate-400/50',
    },
  },

  // Theme 4: Elegant Minimalist
  elegantMinimalist: {
    name: 'elegantMinimalist',
    displayName: 'Elegant Minimalist',
    description: 'Forest green with amber accents for calming elegance',
    colors: {
      primary: '#059669', // Forest Green
      secondary: '#D97706', // Amber
      accent: '#4B5563', // Dark Gray
      background: '#FFFBEB', // Cream
      surface: '#FEF3C7', // Light Cream
      text: '#1F2937', // Dark Gray
      textSecondary: '#6B7280', // Medium Gray
      border: '#D1D5DB', // Light Gray Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#059669] to-[#047857]',
      secondary: 'from-[#D97706] to-[#B45309]',
      background: 'from-[#FFFBEB] to-[#FEF3C7]',
      surface: 'from-[#FEF3C7] to-[#FDE68A]',
    },
    shadows: {
      small: 'shadow-green-200/50',
      medium: 'shadow-green-300/50',
      large: 'shadow-green-400/50',
    },
  },

  // Theme 5: Tech Professional
  techProfessional: {
    name: 'techProfessional',
    displayName: 'Tech Professional',
    description: 'Indigo with rose accents for modern tech feel',
    colors: {
      primary: '#4338CA', // Indigo
      secondary: '#E11D48', // Rose
      accent: '#64748B', // Steel Gray
      background: '#F8FAFC', // Blue-tinted White
      surface: '#F1F5F9', // Light Blue Gray
      text: '#1E293B', // Slate
      textSecondary: '#475569', // Slate Gray
      border: '#CBD5E1', // Slate Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#4338CA] to-[#3730A3]',
      secondary: 'from-[#E11D48] to-[#BE123C]',
      background: 'from-[#F8FAFC] to-[#F1F5F9]',
      surface: 'from-[#F1F5F9] to-[#E2E8F0]',
    },
    shadows: {
      small: 'shadow-indigo-200/50',
      medium: 'shadow-indigo-300/50',
      large: 'shadow-indigo-400/50',
    },
  },

  // Theme 6: Balanced Warmth
  balancedWarmth: {
    name: 'balancedWarmth',
    displayName: 'Balanced Warmth',
    description: 'Teal with burnt orange for balanced warmth',
    colors: {
      primary: '#0D9488', // Teal
      secondary: '#C2410C', // Burnt Orange
      accent: '#6B7280', // Warm Gray
      background: '#FEFEFE', // Warm White
      surface: '#FDFDFD', // Slightly Off-white
      text: '#1F2937', // Dark Gray
      textSecondary: '#4B5563', // Medium Gray
      border: '#D1D5DB', // Light Gray Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#0D9488] to-[#0F766E]',
      secondary: 'from-[#C2410C] to-[#9A3412]',
      background: 'from-[#FEFEFE] to-[#FDFDFD]',
      surface: 'from-[#FDFDFD] to-[#F9FAFB]',
    },
    shadows: {
      small: 'shadow-teal-200/50',
      medium: 'shadow-teal-300/50',
      large: 'shadow-teal-400/50',
    },
  },
};

// Dark mode themes
export const darkThemes: Record<string, Theme> = {
  // Dark Current UI
  currentUIDark: {
    name: 'currentUIDark',
    displayName: 'Current UI Dark',
    description: 'The original design in dark mode',
    colors: {
      primary: '#FF4500', // Orange Red
      secondary: '#E03E00', // Darker Orange
      accent: '#FF6B35', // Lighter Orange
      background: '#111827', // Dark Gray
      surface: '#1F2937', // Darker Gray
      text: '#F9FAFB', // Light Gray
      textSecondary: '#9CA3AF', // Medium Gray
      border: '#374151', // Dark Border
      success: '#10B981', // Green
      warning: '#F59E0B', // Amber
      error: '#EF4444', // Red
      info: '#3B82F6', // Blue
    },
    gradients: {
      primary: 'from-[#FF4500] to-[#E03E00]',
      secondary: 'from-[#FF6B35] to-[#FF4500]',
      background: 'from-gray-900 to-gray-800',
      surface: 'from-gray-800 to-gray-700',
    },
    shadows: {
      small: 'shadow-gray-900/50',
      medium: 'shadow-gray-800/50',
      large: 'shadow-gray-700/50',
    },
  },

  // Dark Warm Professional
  warmProfessionalDark: {
    name: 'warmProfessionalDark',
    displayName: 'Warm Professional Dark',
    description: 'Deep navy with warm accents in dark mode',
    colors: {
      primary: '#1E3A8A', // Deep Navy Blue
      secondary: '#F97316', // Soft Orange
      accent: '#6B7280', // Warm Gray
      background: '#0F172A', // Dark Navy
      surface: '#1E293B', // Slate
      text: '#F1F5F9', // Light Gray
      textSecondary: '#94A3B8', // Medium Gray
      border: '#334155', // Dark Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#1E3A8A] to-[#1E40AF]',
      secondary: 'from-[#F97316] to-[#EA580C]',
      background: 'from-[#0F172A] to-[#1E293B]',
      surface: 'from-[#1E293B] to-[#334155]',
    },
    shadows: {
      small: 'shadow-blue-900/50',
      medium: 'shadow-blue-800/50',
      large: 'shadow-blue-700/50',
    },
  },

  // Dark Modern Corporate
  modernCorporateDark: {
    name: 'modernCorporateDark',
    displayName: 'Modern Corporate Dark',
    description: 'Professional slate with coral accents in dark mode',
    colors: {
      primary: '#475569', // Slate Blue
      secondary: '#F87171', // Coral
      accent: '#374151', // Charcoal
      background: '#0F1419', // Dark Slate
      surface: '#1E293B', // Slate
      text: '#F1F5F9', // Light Gray
      textSecondary: '#94A3B8', // Medium Gray
      border: '#334155', // Dark Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#475569] to-[#334155]',
      secondary: 'from-[#F87171] to-[#EF4444]',
      background: 'from-[#0F1419] to-[#1E293B]',
      surface: 'from-[#1E293B] to-[#334155]',
    },
    shadows: {
      small: 'shadow-slate-900/50',
      medium: 'shadow-slate-800/50',
      large: 'shadow-slate-700/50',
    },
  },

  // Dark Elegant Minimalist
  elegantMinimalistDark: {
    name: 'elegantMinimalistDark',
    displayName: 'Elegant Minimalist Dark',
    description: 'Forest green with amber in elegant dark mode',
    colors: {
      primary: '#059669', // Forest Green
      secondary: '#D97706', // Amber
      accent: '#4B5563', // Dark Gray
      background: '#0F1419', // Dark Green
      surface: '#1A2E1A', // Dark Green Surface
      text: '#F0FDF4', // Light Green
      textSecondary: '#86EFAC', // Medium Green
      border: '#365314', // Dark Green Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#059669] to-[#047857]',
      secondary: 'from-[#D97706] to-[#B45309]',
      background: 'from-[#0F1419] to-[#1A2E1A]',
      surface: 'from-[#1A2E1A] to-[#365314]',
    },
    shadows: {
      small: 'shadow-green-900/50',
      medium: 'shadow-green-800/50',
      large: 'shadow-green-700/50',
    },
  },

  // Dark Tech Professional
  techProfessionalDark: {
    name: 'techProfessionalDark',
    displayName: 'Tech Professional Dark',
    description: 'Indigo with rose in modern tech dark mode',
    colors: {
      primary: '#4338CA', // Indigo
      secondary: '#E11D48', // Rose
      accent: '#64748B', // Steel Gray
      background: '#0F1419', // Dark Blue
      surface: '#1E293B', // Slate
      text: '#F1F5F9', // Light Gray
      textSecondary: '#94A3B8', // Medium Gray
      border: '#334155', // Dark Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#4338CA] to-[#3730A3]',
      secondary: 'from-[#E11D48] to-[#BE123C]',
      background: 'from-[#0F1419] to-[#1E293B]',
      surface: 'from-[#1E293B] to-[#334155]',
    },
    shadows: {
      small: 'shadow-indigo-900/50',
      medium: 'shadow-indigo-800/50',
      large: 'shadow-indigo-700/50',
    },
  },

  // Dark Balanced Warmth
  balancedWarmthDark: {
    name: 'balancedWarmthDark',
    displayName: 'Balanced Warmth Dark',
    description: 'Teal with burnt orange in warm dark mode',
    colors: {
      primary: '#0D9488', // Teal
      secondary: '#C2410C', // Burnt Orange
      accent: '#6B7280', // Warm Gray
      background: '#0F1419', // Dark Teal
      surface: '#1A2E1A', // Dark Green Surface
      text: '#F0FDF4', // Light Green
      textSecondary: '#86EFAC', // Medium Green
      border: '#365314', // Dark Green Border
      success: '#059669', // Emerald
      warning: '#D97706', // Amber
      error: '#DC2626', // Red
      info: '#2563EB', // Blue
    },
    gradients: {
      primary: 'from-[#0D9488] to-[#0F766E]',
      secondary: 'from-[#C2410C] to-[#9A3412]',
      background: 'from-[#0F1419] to-[#1A2E1A]',
      surface: 'from-[#1A2E1A] to-[#365314]',
    },
    shadows: {
      small: 'shadow-teal-900/50',
      medium: 'shadow-teal-800/50',
      large: 'shadow-teal-700/50',
    },
  },
};

// Theme management utilities
export const getTheme = (themeName: string, isDark: boolean = false): Theme => {
  const themeKey = isDark ? `${themeName}Dark` : themeName;
  const theme = isDark ? darkThemes[themeKey] : themes[themeName];
  
  if (!theme) {
    // Fallback to default theme
    return isDark ? darkThemes.currentUIDark : themes.currentUI;
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
