// CDK Intelligent Suite — single theme, light and dark variants only
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
    surfaceVariant: string;  // table headers, input bg
    hover: string;           // nav hover, row hover
    active: string;          // active nav, selected states
    text: string;
    textSecondary: string;
    border: string;
    borderStrong?: string;   // stronger border for focus/hover
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

// ─── FalconX CDK palette: Light ───────────────────────────────────────────────
// Warm ivory/graphite family — premium enterprise feel.
// Page bg  #F2EFEA   Warm ivory — rich base, not sterile white
// Card     #FAFAF7   Warm white — elevated above page for clear layer separation
// Surface  #EDEBE6   Warm surface for table headers, input backgrounds
// Hover    #E5E2DC   Warm hover state
// Active   #D9D5CD   Warm selected/active state
// Border   #DDD9D2   Warm soft border
// Text     #1C1A17   Deep warm charcoal — rich, high contrast
// Text sec #1C1A17   Deep warm charcoal — same as text for better readability in light mode
export const cdkLightTheme: Theme = {
  name: 'cdkLight',
  displayName: 'FalconX Light',
  description: 'FalconX CDK Intelligent Suite — light mode palette',
  colors: {
    primary: '#1C1A17',       // deep warm charcoal — primary text / actions
    secondary: '#3D3A35',     // warm dark gray — labels, secondary text
    accent: '#9E6B18',        // mustard (deepened for warm-bg contrast)
    background: '#F2EFEA',    // warm ivory page background
    surface: '#FAFAF7',       // warm white card / sidebar / header
    surfaceVariant: '#EDEBE6', // table headers, input bg
    hover: '#E5E2DC',         // nav hover, row hover
    active: '#D9D5CD',        // active nav, selected states
    text: '#1C1A17',          // headings, values
    textSecondary: '#1C1A17', // labels, descriptions — same as text for visibility in light mode
    border: '#DDD9D2',        // all borders
    borderStrong: '#B8B2AA',  // focus/hover emphasis
    success: '#9E6B18',       // semantic: mustard (aligned to brand)
    warning: '#C96A00',       // semantic: amber
    error: '#C41E1E',         // semantic: red
    info: '#1D4ED8',          // semantic: blue
  },
  gradients: {
    primary: 'from-[#1C1A17] to-[#3D3A35]',
    secondary: 'from-[#3D3A35] to-[#6B6660]',
    background: 'from-[#F2EFEA] to-[#E5E2DC]',
    surface: 'from-[#FAFAF7] to-[#EDEBE6]',
  },
  shadows: {
    small: '0 1px 3px rgba(30,25,15,0.09), 0 1px 2px rgba(30,25,15,0.06)',
    medium: '0 4px 12px rgba(30,25,15,0.09), 0 2px 4px rgba(30,25,15,0.06)',
    large: '0 8px 28px rgba(30,25,15,0.12), 0 4px 8px rgba(30,25,15,0.07)',
  },
};

// ─── FalconX CDK palette (dark default) ───────────────────────────────────────
// Token       Value     Used for
// Page bg     #13151C   Outermost background
// Card bg     #1E2028   Sidebar, header, all cards
// Surface     #252830   Table headers, input bg
// Hover       #2D3142   Nav hover, row hover
// Active      #353A52   Active nav, selected states
// Border      #2A2D3E   All borders
// Text        #E8EAF0   Headings, values
// Text sec    #8B93A8   Labels, descriptions
export const cdkDarkTheme: Theme = {
  name: 'cdkDark',
  displayName: 'FalconX Dark',
  description: 'FalconX CDK Intelligent Suite — official dark palette',
  colors: {
    primary: '#E8EAF0',       // decorative accent → text-primary
    secondary: '#8B93A8',     // decorative secondary → text-secondary
    accent: '#D4A847',        // mustard yellow accent
    background: '#13151C',    // page bg
    surface: '#1E2028',       // card bg — sidebar, header, cards
    surfaceVariant: '#252830', // table headers, input bg
    hover: '#2D3142',         // nav hover, row hover
    active: '#353A52',        // active nav, selected states
    text: '#E8EAF0',          // headings, values
    textSecondary: '#8B93A8', // labels, descriptions
    border: '#2A2D3E',        // all borders
    borderStrong: '#3D4258',  // focus, hover emphasis
    success: '#D4A847',       // semantic: mustard yellow
    warning: '#FCD34D',       // semantic: amber
    error: '#F87171',         // semantic: red
    info: '#93C5FD',          // semantic: blue
  },
  gradients: {
    primary: 'from-[#E8EAF0] to-[#8B93A8]',
    secondary: 'from-[#8B93A8] to-[#545B78]',
    background: 'from-[#13151C] to-[#1E2028]',
    surface: 'from-[#1E2028] to-[#252830]',
  },
  shadows: {
    small: '0 1px 2px rgba(0,0,0,0.4)',
    medium: '0 2px 8px rgba(0,0,0,0.5)',
    large: '0 4px 16px rgba(0,0,0,0.6)',
  },
};

// ─── Compat maps (kept for any legacy imports) ────────────────────────────────
export const themes: Record<string, Theme> = {
  cdkLight: cdkLightTheme,
};

export const darkThemes: Record<string, Theme> = {
  cdkDark: cdkDarkTheme,
};

// ─── Theme utilities ──────────────────────────────────────────────────────────
export const getTheme = (_themeName: string, isDark: boolean = false): Theme =>
  isDark ? cdkDarkTheme : cdkLightTheme;

export const getAllThemes = (isDark: boolean = false): Theme[] => [
  isDark ? cdkDarkTheme : cdkLightTheme,
];

export const getThemeNames = (isDark: boolean = false): string[] => [
  isDark ? 'cdkDark' : 'cdkLight',
];

// CSS Custom Properties generator
// Note: Core palette vars are now driven by globals.css (:root / .dark).
// This generator is kept for components that access theme.colors directly
// and need the --color-* namespace.
export const generateThemeCSS = (theme: Theme): string => {
  const alpha = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  };
  return `
    :root {
      --color-primary: ${theme.colors.primary};
      --color-secondary: ${theme.colors.secondary};
      --color-accent: ${theme.colors.accent};
      --color-background: ${theme.colors.background};
      --color-surface: ${theme.colors.surface};
      --color-surface-variant: ${theme.colors.surfaceVariant};
      --color-hover: ${theme.colors.hover};
      --color-active: ${theme.colors.active};
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

      --glass-bg: ${alpha(theme.colors.text, 0.04)};
      --glass-border: ${alpha(theme.colors.text, 0.08)};
    }
  `;
};
