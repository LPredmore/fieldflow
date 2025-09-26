import { useMemo } from 'react';

/**
 * Hook to get the current user's timezone from browser
 * Returns the IANA timezone identifier automatically detected from the browser
 */
export function useUserTimezone() {
  const browserTimezone = useMemo(() => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return timezone;
    } catch (error) {
      console.warn('Failed to detect browser timezone, falling back to America/New_York');
      return 'America/New_York';
    }
  }, []);

  return browserTimezone;
}