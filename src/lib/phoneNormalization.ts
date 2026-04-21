import { parsePhoneNumberFromString, isValidPhoneNumber, AsYouType } from "libphonenumber-js";

/**
 * Normalize a free-text phone string to E.164 format (+15558675309).
 * Returns null if the input cannot be parsed as a valid number.
 * Defaults to US country if no country code is provided.
 */
export function toE164(input: string | null | undefined, defaultCountry: "US" = "US"): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
    if (parsed && parsed.isValid()) {
      return parsed.number; // E.164 format
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Format a phone number for display, e.g. "+15558675309" -> "(555) 867-5309"
 */
export function formatPhoneDisplay(input: string | null | undefined): string {
  if (!input) return "";
  try {
    const parsed = parsePhoneNumberFromString(input, "US");
    if (parsed) {
      return parsed.formatNational();
    }
  } catch {
    // ignore
  }
  return input;
}

/**
 * Live formatter for input fields (as the user types).
 */
export function formatAsYouType(input: string, country: "US" = "US"): string {
  return new AsYouType(country).input(input);
}

/**
 * Validate that an input string is a valid phone number.
 */
export function isValidPhone(input: string | null | undefined, country: "US" = "US"): boolean {
  if (!input) return false;
  try {
    return isValidPhoneNumber(input, country);
  } catch {
    return false;
  }
}
