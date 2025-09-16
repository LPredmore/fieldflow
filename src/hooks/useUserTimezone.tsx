import { useMemo } from 'react';
import { useSettings } from './useSettings';
import { DEFAULT_TIMEZONE } from '@/lib/timezoneUtils';

/**
 * Mapping from plain language timezone names to IANA timezone identifiers
 */
const TIMEZONE_MAPPING: Record<string, string> = {
  'Eastern': 'America/New_York',
  'Central': 'America/Chicago',
  'Mountain': 'America/Denver',
  'Pacific': 'America/Los_Angeles',
  'Arizona': 'America/Phoenix',
  'Alaska': 'America/Anchorage',
  'Hawaii Aleutian': 'Pacific/Honolulu',
};

/**
 * Hook to get the current user's timezone preference
 * Returns the IANA timezone identifier from user settings or a default fallback
 */
export function useUserTimezone() {
  const { settings } = useSettings();

  const userTimezone = useMemo(() => {
    if (settings?.time_zone && TIMEZONE_MAPPING[settings.time_zone]) {
      return TIMEZONE_MAPPING[settings.time_zone];
    }
    return DEFAULT_TIMEZONE;
  }, [settings]);

  return userTimezone;
}