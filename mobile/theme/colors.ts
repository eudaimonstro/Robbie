/**
 * Color palette matching the web app's Tailwind colors
 */
export const colors = {
  // Primary (Indigo)
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },

  // Success (Green)
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },

  // Danger (Red)
  danger: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },

  // Warning (Amber)
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },

  // Neutral (Gray)
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },

  // Base colors
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',

  // Semantic colors (shortcuts)
  text: {
    primary: '#111827', // gray-900
    secondary: '#4b5563', // gray-600
    muted: '#9ca3af', // gray-400
    inverse: '#ffffff', // white
  },

  background: {
    default: '#ffffff',
    secondary: '#f9fafb', // gray-50
    tertiary: '#f3f4f6', // gray-100
  },

  border: {
    default: '#e5e7eb', // gray-200
    focus: '#4f46e5', // primary-600
  },
} as const;

// Vote button colors
export const voteColors = {
  yea: colors.success[600],
  yeaPressed: colors.success[700],
  yeaBg: colors.success[50],
  nay: colors.danger[600],
  nayPressed: colors.danger[700],
  nayBg: colors.danger[50],
  abstain: colors.gray[500],
  abstainPressed: colors.gray[600],
  abstainBg: colors.gray[100],
} as const;

// Stance colors for speaker queue
export const stanceColors = {
  pro: colors.success[600],
  con: colors.danger[600],
  neutral: colors.gray[500],
} as const;
