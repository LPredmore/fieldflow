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
  'Hawaii-Aleutian': 'Pacific/Honolulu',
  'Atlantic': 'America/Halifax',
  'Newfoundland': 'America/St_Johns',
  // Additional US timezones
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
  'US/Alaska': 'America/Anchorage',
  'US/Hawaii': 'Pacific/Honolulu',
  // Common timezone abbreviations
  'EST': 'America/New_York',
  'CST': 'America/Chicago',
  'MST': 'America/Denver',
  'PST': 'America/Los_Angeles',
  'AKST': 'America/Anchorage',
  'HST': 'Pacific/Honolulu',
};

/**
 * Hook to get the current user's timezone preference
 * Returns the IANA timezone identifier from user settings or a default fallback
 */
export function useUserTimezone() {
  const { settings } = useSettings();

  const userTimezone = useMemo(() => {
    if (settings?.time_zone && TIMEZONE_MAPPING[settings.time_zone]) {
      const mappedTimezone = TIMEZONE_MAPPING[settings.time_zone];
      console.log(`Timezone mapping: ${settings.time_zone} → ${mappedTimezone}`);
      return mappedTimezone;
    }
    console.log(`Using default timezone: ${DEFAULT_TIMEZONE} (user setting: ${settings?.time_zone || 'none'})`);
    return DEFAULT_TIMEZONE;
  }, [settings]);

  return userTimezone;
}