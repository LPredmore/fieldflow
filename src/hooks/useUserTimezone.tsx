import { useMemo } from 'react';
import { useSettings } from './useSettings';
import { DEFAULT_TIMEZONE } from '@/lib/timezoneUtils';

/**
 * Hook to get the current user's timezone preference
 * Returns the timezone from user settings or a default fallback
 */
export function useUserTimezone() {
  const { settings } = useSettings();

  const userTimezone = useMemo(() => {
    if (settings?.user_preferences?.timezone) {
      return settings.user_preferences.timezone;
    }
    return DEFAULT_TIMEZONE;
  }, [settings]);

  return userTimezone;
}