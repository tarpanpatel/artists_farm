/**
 * Theme Settings Service
 * Fetches and applies dynamic platform theme settings
 */

export interface ThemeSettings {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  darkMode: {
    background: string;
    surface: string;
    text: string;
    textMuted: string;
  };
  typography: {
    fontFamily: string;
    baseFontSize: string;
    headingScale: number;
  };
  spacing: {
    baseUnit: string;
  };
  borderRadius: {
    small: string;
    medium: string;
    large: string;
  };
  shadows: {
    small: string;
    medium: string;
    large: string;
  };
}

export async function fetchThemeSettings(): Promise<ThemeSettings> {
  try {
    const response = await fetch('/php/api/router.php?action=get_theme_settings');
    const data = await response.json();

    if (data.status === 'success' && data.data) {
      return data.data;
    }

    throw new Error(data.message || 'Failed to fetch theme settings');
  } catch (error) {
    console.error('Error fetching theme settings:', error);
    return getDefaultTheme();
  }
}

export async function saveThemeSettings(settings: ThemeSettings, apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('/php/api/router.php?action=save_theme_settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      credentials: 'include',
      body: JSON.stringify({ settings }),
    });

    const data = await response.json();
    return data.success || data.status === 'success';
  } catch (error) {
    console.error('Error saving theme settings:', error);
    return false;
  }
}

export function applyThemeSettings(settings: ThemeSettings): void {
  const root = document.documentElement;

  // Apply color variables
  root.style.setProperty('--color-primary', settings.colors.primary);
  root.style.setProperty('--color-secondary', settings.colors.secondary);
  root.style.setProperty('--color-accent', settings.colors.accent);
  root.style.setProperty('--color-success', settings.colors.success);
  root.style.setProperty('--color-warning', settings.colors.warning);
  root.style.setProperty('--color-error', settings.colors.error);
  root.style.setProperty('--color-info', settings.colors.info);

  // Apply dark mode colors
  root.style.setProperty('--dark-background', settings.darkMode.background);
  root.style.setProperty('--dark-surface', settings.darkMode.surface);
  root.style.setProperty('--dark-text', settings.darkMode.text);
  root.style.setProperty('--dark-text-muted', settings.darkMode.textMuted);

  // Apply typography
  root.style.setProperty('--font-family', settings.typography.fontFamily);
  root.style.setProperty('--base-font-size', settings.typography.baseFontSize);
  root.style.setProperty('--heading-scale', settings.typography.headingScale.toString());

  // Apply spacing
  root.style.setProperty('--spacing-unit', settings.spacing.baseUnit);

  // Apply border radius
  root.style.setProperty('--radius-sm', settings.borderRadius.small);
  root.style.setProperty('--radius-md', settings.borderRadius.medium);
  root.style.setProperty('--radius-lg', settings.borderRadius.large);

  // Apply shadows
  root.style.setProperty('--shadow-sm', settings.shadows.small);
  root.style.setProperty('--shadow-md', settings.shadows.medium);
  root.style.setProperty('--shadow-lg', settings.shadows.large);
}

export function getDefaultTheme(): ThemeSettings {
  return {
    colors: {
      primary: '#3b82f6',
      secondary: '#1e293b',
      accent: '#06b6d4',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#0284c7',
    },
    darkMode: {
      background: '#0f172a',
      surface: '#1e293b',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
      baseFontSize: '16px',
      headingScale: 1.2,
    },
    spacing: {
      baseUnit: '4px',
    },
    borderRadius: {
      small: '0.375rem',
      medium: '0.5rem',
      large: '1rem',
    },
    shadows: {
      small: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      medium: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      large: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    },
  };
}
