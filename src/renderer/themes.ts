// Theme definitions shared by GitConnect Pro, MacroVox, and VoxIDE
export interface Theme {
  id: string
  name: string
  description: string
  colors: {
    // Backgrounds
    bgPrimary: string
    bgSecondary: string
    bgTertiary: string
    // Accents
    accentPrimary: string
    accentSecondary: string
    accentHover: string
    // Text
    textPrimary: string
    textSecondary: string
    textMuted: string
    // Borders
    borderPrimary: string
    borderAccent: string
    // States
    danger: string
    dangerBg: string
    success: string
  }
}

export const THEMES: Theme[] = [
  {
    id: 'mcrn',
    name: 'MCRN',
    description: 'Martian Congressional Republic Navy',
    colors: {
      bgPrimary: '#0a0f14',
      bgSecondary: '#0d1117',
      bgTertiary: '#161b22',
      accentPrimary: '#06b6d4', // cyan-500
      accentSecondary: '#0891b2', // cyan-600
      accentHover: '#22d3ee', // cyan-400
      textPrimary: '#cbd5e1', // slate-300
      textSecondary: '#64748b', // slate-500
      textMuted: '#475569', // slate-600
      borderPrimary: 'rgba(6, 182, 212, 0.3)', // cyan-500/30
      borderAccent: 'rgba(6, 182, 212, 0.5)', // cyan-500/50
      danger: '#ef4444', // red-500
      dangerBg: 'rgba(127, 29, 29, 0.3)', // red-900/30
      success: '#22c55e', // green-500
    }
  },
  {
    id: 'mars',
    name: 'Mars',
    description: 'Red Planet warfare',
    colors: {
      bgPrimary: '#0f0a0a',
      bgSecondary: '#1a0f0f',
      bgTertiary: '#261414',
      accentPrimary: '#ef4444', // red-500
      accentSecondary: '#dc2626', // red-600
      accentHover: '#f87171', // red-400
      textPrimary: '#fecaca', // red-200
      textSecondary: '#f87171', // red-400
      textMuted: '#dc2626', // red-600
      borderPrimary: 'rgba(239, 68, 68, 0.3)', // red-500/30
      borderAccent: 'rgba(239, 68, 68, 0.5)', // red-500/50
      danger: '#f97316', // orange-500
      dangerBg: 'rgba(124, 45, 18, 0.3)', // orange-900/30
      success: '#22c55e', // green-500
    }
  },
  {
    id: 'belter',
    name: 'Belter',
    description: 'Outer Planets Alliance',
    colors: {
      bgPrimary: '#0c0a14',
      bgSecondary: '#110d1a',
      bgTertiary: '#1a1525',
      accentPrimary: '#a855f7', // purple-500
      accentSecondary: '#9333ea', // purple-600
      accentHover: '#c084fc', // purple-400
      textPrimary: '#e2e8f0', // slate-200
      textSecondary: '#94a3b8', // slate-400
      textMuted: '#64748b', // slate-500
      borderPrimary: 'rgba(168, 85, 247, 0.3)', // purple-500/30
      borderAccent: 'rgba(168, 85, 247, 0.5)', // purple-500/50
      danger: '#f43f5e', // rose-500
      dangerBg: 'rgba(136, 19, 55, 0.3)', // rose-900/30
      success: '#10b981', // emerald-500
    }
  },
  {
    id: 'earth',
    name: 'Earth',
    description: 'United Nations Navy',
    colors: {
      bgPrimary: '#0a1014',
      bgSecondary: '#0d1520',
      bgTertiary: '#141f2e',
      accentPrimary: '#3b82f6', // blue-500
      accentSecondary: '#2563eb', // blue-600
      accentHover: '#60a5fa', // blue-400
      textPrimary: '#e2e8f0', // slate-200
      textSecondary: '#94a3b8', // slate-400
      textMuted: '#64748b', // slate-500
      borderPrimary: 'rgba(59, 130, 246, 0.3)', // blue-500/30
      borderAccent: 'rgba(59, 130, 246, 0.5)', // blue-500/50
      danger: '#ef4444', // red-500
      dangerBg: 'rgba(127, 29, 29, 0.3)', // red-900/30
      success: '#22c55e', // green-500
    }
  },
  {
    id: 'protomolecule',
    name: 'Protomolecule',
    description: 'Alien bio-luminescent',
    colors: {
      bgPrimary: '#030712',
      bgSecondary: '#0a0f1a',
      bgTertiary: '#111827',
      accentPrimary: '#14b8a6', // teal-500
      accentSecondary: '#0d9488', // teal-600
      accentHover: '#2dd4bf', // teal-400
      textPrimary: '#d1fae5', // emerald-100
      textSecondary: '#6ee7b7', // emerald-300
      textMuted: '#34d399', // emerald-400
      borderPrimary: 'rgba(20, 184, 166, 0.4)', // teal-500/40
      borderAccent: 'rgba(20, 184, 166, 0.6)', // teal-500/60
      danger: '#f97316', // orange-500
      dangerBg: 'rgba(124, 45, 18, 0.3)', // orange-900/30
      success: '#84cc16', // lime-500
    }
  },
  {
    id: 'laconia',
    name: 'Laconia',
    description: 'Laconian Empire',
    colors: {
      bgPrimary: '#0f0a0a',
      bgSecondary: '#1a1010',
      bgTertiary: '#261616',
      accentPrimary: '#f59e0b', // amber-500
      accentSecondary: '#d97706', // amber-600
      accentHover: '#fbbf24', // amber-400
      textPrimary: '#fef3c7', // amber-100
      textSecondary: '#fcd34d', // amber-300
      textMuted: '#f59e0b', // amber-500
      borderPrimary: 'rgba(245, 158, 11, 0.3)', // amber-500/30
      borderAccent: 'rgba(245, 158, 11, 0.5)', // amber-500/50
      danger: '#dc2626', // red-600
      dangerBg: 'rgba(127, 29, 29, 0.4)', // red-900/40
      success: '#84cc16', // lime-500
    }
  },
  {
    id: 'highcontrast',
    name: 'High Contrast',
    description: 'Maximum contrast for accessibility (WCAG AAA)',
    colors: {
      bgPrimary: '#000000',
      bgSecondary: '#111111',
      bgTertiary: '#1a1a1a',
      accentPrimary: '#ffff00', // Yellow on black = max contrast
      accentSecondary: '#ffd700',
      accentHover: '#ffffff',
      textPrimary: '#ffffff',
      textSecondary: '#cccccc',
      textMuted: '#999999',
      borderPrimary: 'rgba(255, 255, 0, 0.5)',
      borderAccent: 'rgba(255, 255, 0, 0.8)',
      danger: '#ff4444',
      dangerBg: 'rgba(255, 0, 0, 0.3)',
      success: '#00ff00',
    }
  },
]

export function getTheme(themeId: string): Theme {
  return THEMES.find(t => t.id === themeId) || THEMES[0]
}

export function getStoredTheme(): string {
  return localStorage.getItem('app_theme') || 'mcrn'
}

export function setStoredTheme(themeId: string): void {
  localStorage.setItem('app_theme', themeId)
}
