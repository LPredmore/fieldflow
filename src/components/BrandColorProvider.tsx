import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { generateBrandColorPalette, DEFAULT_BRAND_COLORS, hexToHsl } from '@/lib/colorUtils';

/**
 * Brand Color Provider - Dynamically injects CSS variables based on brand color setting
 */
export function BrandColorProvider({ children }: { children: React.ReactNode }) {
  const { settings, loading } = useSettings();

  useEffect(() => {
    if (loading) return;

    const brandColor = settings?.brand_color;
    const textColor = settings?.text_color;
    const colorPalette = brandColor 
      ? generateBrandColorPalette(brandColor)
      : DEFAULT_BRAND_COLORS;

    // Get root element to inject CSS variables
    const root = document.documentElement;

    // Update light theme variables
    root.style.setProperty('--primary', colorPalette.light.primary);
    root.style.setProperty('--primary-dark', colorPalette.light.primaryDark);
    root.style.setProperty('--primary-light', colorPalette.light.primaryLight);
    root.style.setProperty('--ring', colorPalette.light.ring);
    
    // Update text color if provided
    if (textColor) {
      const textColorHSL = hexToHsl(textColor);
      if (textColorHSL) {
        root.style.setProperty('--primary-foreground', textColorHSL);
      }
    }

    // Update dark theme variables by creating/updating CSS rule
    updateDarkThemeVariables(colorPalette.dark, textColor);

  }, [settings?.brand_color, settings?.text_color, loading]);

  return <>{children}</>;
}

/**
 * Update dark theme CSS variables
 */
function updateDarkThemeVariables(darkColors: {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  ring: string;
}, textColor?: string | null) {
  // Find or create the dark theme style element
  let darkStyleElement = document.getElementById('dynamic-dark-theme') as HTMLStyleElement;
  
  if (!darkStyleElement) {
    darkStyleElement = document.createElement('style');
    darkStyleElement.id = 'dynamic-dark-theme';
    document.head.appendChild(darkStyleElement);
  }

  // Convert hex text color to HSL format for CSS variables if provided
  const textColorHSL = textColor ? hexToHsl(textColor) : null;

  // Update dark theme CSS
  darkStyleElement.textContent = `
    .dark {
      --primary: ${darkColors.primary};
      --primary-dark: ${darkColors.primaryDark};
      --primary-light: ${darkColors.primaryLight};
      --ring: ${darkColors.ring};
      ${textColorHSL ? `--primary-foreground: ${textColorHSL};` : ''}
    }
  `;
}