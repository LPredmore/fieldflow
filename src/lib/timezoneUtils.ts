import { format, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * Default timezone fallback
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Convert a date/time from user's timezone to UTC for storage
 */
export function convertToUTC(dateTime: Date | string, userTimezone: string): Date {
  const date = typeof dateTime === 'string' ? parseISO(dateTime) : dateTime;
  return fromZonedTime(date, userTimezone);
}

/**
 * Convert a UTC date/time to user's timezone for display
 */
export function convertFromUTC(utcDateTime: Date | string, userTimezone: string): Date {
  const date = typeof utcDateTime === 'string' ? parseISO(utcDateTime) : utcDateTime;
  return toZonedTime(date, userTimezone);
}

/**
 * Format a UTC date/time in user's timezone
 */
export function formatInUserTimezone(
  utcDateTime: Date | string, 
  userTimezone: string, 
  formatStr: string = 'yyyy-MM-dd HH:mm:ss'
): string {
  const date = typeof utcDateTime === 'string' ? parseISO(utcDateTime) : utcDateTime;
  return formatInTimeZone(date, userTimezone, formatStr);
}

/**
 * Combine a date and time string in user's timezone, then convert to UTC
 * Used for form inputs where user enters date/time in their local timezone
 */
export function combineDateTimeToUTC(
  date: string, // YYYY-MM-DD format
  time: string, // HH:mm format
  userTimezone: string
): Date {
  const dateTimeString = `${date} ${time}:00`;
  const localDateTime = parseISO(dateTimeString);
  return fromZonedTime(localDateTime, userTimezone);
}

/**
 * Convert UTC datetime to user's local date and time strings
 * Returns object with separate date and time strings
 */
export function splitUTCToLocalDateTime(
  utcDateTime: Date | string,
  userTimezone: string
): { date: string; time: string } {
  const localDateTime = convertFromUTC(utcDateTime, userTimezone);
  
  return {
    date: format(localDateTime, 'yyyy-MM-dd'),
    time: format(localDateTime, 'HH:mm')
  };
}

/**
 * Get current date/time in user's timezone
 */
export function getCurrentInTimezone(userTimezone: string): Date {
  return toZonedTime(new Date(), userTimezone);
}

/**
 * Convert datetime to ISO string for FullCalendar compatibility
 * Ensures proper format with timezone information
 */
export function toFullCalendarFormat(dateTime: Date | string): string {
  const date = typeof dateTime === 'string' ? parseISO(dateTime) : dateTime;
  return date.toISOString();
}

/**
 * Convert user local datetime to FullCalendar format (via UTC)
 */
export function localToFullCalendar(
  dateTime: Date | string,
  userTimezone: string
): string {
  const utcDate = convertToUTC(dateTime, userTimezone);
  return toFullCalendarFormat(utcDate);
}

/**
 * Convert UTC datetime to user timezone and format for FullCalendar
 */
export function utcToFullCalendarInTimezone(
  utcDateTime: Date | string,
  userTimezone: string
): string {
  const localDate = convertFromUTC(utcDateTime, userTimezone);
  return toFullCalendarFormat(localDate);
}