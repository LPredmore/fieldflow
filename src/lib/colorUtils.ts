/**
 * Color utility functions for dynamic brand color system
 */

/**
 * Convert hex color to HSL format
 * @param hex - Hex color string (e.g., "#1E90FF")
 * @returns HSL values as string "h s% l%" or null if invalid
 */
export function hexToHsl(hex: string): string | null {
  // Remove # if present and validate format
  const cleanHex = hex.replace('#', '');
  if (!/^([0-9A-F]{3}|[0-9A-F]{6})$/i.test(cleanHex)) {
    return null;
  }

  // Convert 3-digit hex to 6-digit
  const fullHex = cleanHex.length === 3 
    ? cleanHex.split('').map(char => char + char).join('')
    : cleanHex;

  // Parse RGB values
  const r = parseInt(fullHex.substr(0, 2), 16) / 255;
  const g = parseInt(fullHex.substr(2, 2), 16) / 255;
  const b = parseInt(fullHex.substr(4, 2), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    
    switch (max) {
      case r:
        h = (g - b) / diff + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / diff + 2;
        break;
      case b:
        h = (r - g) / diff + 4;
        break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Generate darker variant of HSL color
 * @param hsl - HSL string "h s% l%"
 * @returns Darker HSL variant
 */
export function getDarkerVariant(hsl: string): string {
  const match = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!match) return hsl;
  
  const [, h, s, l] = match;
  const lightness = Math.max(15, parseInt(l) - 15); // Darken by 15%, minimum 15%
  
  return `${h} ${s}% ${lightness}%`;
}

/**
 * Generate lighter variant of HSL color
 * @param hsl - HSL string "h s% l%"
 * @returns Lighter HSL variant
 */
export function getLighterVariant(hsl: string): string {
  const match = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!match) return hsl;
  
  const [, h, s, l] = match;
  const lightness = Math.min(85, parseInt(l) + 15); // Lighten by 15%, maximum 85%
  
  return `${h} ${s}% ${lightness}%`;
}

/**
 * Default color values (Material Blue)
 */
export const DEFAULT_BRAND_COLORS = {
  light: {
    primary: '207 90% 54%',
    primaryDark: '210 100% 45%',
    primaryLight: '207 82% 66%',
    ring: '207 90% 54%',
  },
  dark: {
    primary: '207 82% 66%',
    primaryDark: '207 90% 54%',
    primaryLight: '207 82% 76%',
    ring: '207 82% 66%',
  }
};

/**
 * Generate complete color palette from brand color
 * @param brandColor - Hex color string
 * @returns Color palette for light and dark modes
 */
export function generateBrandColorPalette(brandColor: string) {
  const hsl = hexToHsl(brandColor);
  if (!hsl) return DEFAULT_BRAND_COLORS;

  const darker = getDarkerVariant(hsl);
  const lighter = getLighterVariant(hsl);

  return {
    light: {
      primary: hsl,
      primaryDark: darker,
      primaryLight: lighter,
      ring: hsl,
    },
    dark: {
      primary: lighter,
      primaryDark: hsl,
      primaryLight: getLighterVariant(lighter),
      ring: lighter,
    }
  };
}