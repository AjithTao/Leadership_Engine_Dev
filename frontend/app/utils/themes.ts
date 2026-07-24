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
// Functionize design language — lavender canvas, white surfaces, indigo text,
// action blue. Chrome (navbar/sidebar) goes dark slate-purple via the
// --nav-*/--sidebar-* CSS vars in globals.css.
// Page bg  #F0F1F8   Lavender-gray app canvas
// Card     #FFFFFF   White cards, tables, modals, panels
// Surface  #ECEDF3   Table headers, subtle insets
// Hover    #E9EAF3   Row hover
// Active   #DFE1EF   Selected states
// Border   #D8DAE5   Lines & fields
// Text     #3F3E63   Deep indigo — headings, values
// Text sec #4A4A5E   Body text
export const cdkLightTheme: Theme = {
  name: 'cdkLight',
  displayName: 'FalconX Light',
  description: 'FalconX CDK Intelligent Suite — light mode palette',
  colors: {
    primary: '#3F3E63',       // deep indigo — primary text / headings
    secondary: '#4A4A5E',     // body gray-indigo — labels, secondary text
    accent: '#1878B9',        // action blue — buttons, active accents
    background: '#F0F1F8',    // lavender-gray page background
    surface: '#FFFFFF',       // white card / panel
    surfaceVariant: '#ECEDF3', // table headers, subtle insets
    hover: '#E9EAF3',         // nav hover, row hover
    active: '#DFE1EF',        // active nav, selected states
    text: '#3F3E63',          // headings, values
    textSecondary: '#4A4A5E', // labels, descriptions
    border: '#D8DAE5',        // all borders
    borderStrong: '#B9BDD1',  // focus/hover emphasis
    success: '#43A05C',       // semantic: green
    warning: '#B87700',       // semantic: amber
    error: '#C21F3A',         // semantic: red
    info: '#1E88C7',          // semantic: link blue
  },
  gradients: {
    primary: 'from-[#3F3E63] to-[#504E7A]',
    secondary: 'from-[#504E7A] to-[#8A8AA0]',
    background: 'from-[#F0F1F8] to-[#E9E8F0]',
    surface: 'from-[#FFFFFF] to-[#ECEDF3]',
  },
  shadows: {
    small: '0 1px 3px rgba(30,30,60,0.08)',
    medium: '0 4px 12px rgba(30,30,60,0.10), 0 2px 4px rgba(30,30,60,0.06)',
    large: '0 8px 28px rgba(30,30,60,0.14), 0 4px 8px rgba(30,30,60,0.08)',
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
