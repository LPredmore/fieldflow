import { useAuth } from './useAuth';
import { useUserTimezone } from './useUserTimezone';
import { useJobSeries } from './useJobSeries';
import { combineDateTimeToUTC } from '@/lib/timezoneUtils';
import { useToast } from '@/hooks/use-toast';

export interface JobCreationData {
  title: string;
  description?: string;
  customer_id: string;
  customer_name: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduled_date: string; // YYYY-MM-DD
  start_time?: string; // HH:mm
  end_time?: string; // HH:mm
  assigned_to_user_id?: string;
  service_type: 'plumbing' | 'electrical' | 'hvac' | 'cleaning' | 'landscaping' | 'general_maintenance' | 'other';
  estimated_cost?: number;
  actual_cost?: number;
  completion_notes?: string;
  is_recurring: boolean;
  rrule?: string;
  until_date?: string;
}

/**
 * Hook for creating jobs with proper timezone handling
 * All jobs are created in job_series and get materialized as job_occurrences
 */
export function useJobCreation() {
  const { user, tenantId } = useAuth();
  const userTimezone = useUserTimezone();
  const { createJobSeries } = useJobSeries();
  const { toast } = useToast();

  const createJob = async (jobData: JobCreationData) => {
    if (!user || !tenantId) {
      throw new Error('User not authenticated');
    }

    try {
      console.log('Creating job with data:', jobData);
      console.log('User timezone:', userTimezone);

      // Convert local date/time to UTC for storage
      let scheduledTimeUTC: string | null = null;
      let scheduledEndTimeUTC: string | null = null;
      let durationMinutes = 60; // Default duration

      if (jobData.start_time) {
        try {
          const utcStart = combineDateTimeToUTC(
            jobData.scheduled_date, 
            jobData.start_time, 
            userTimezone
          );
          scheduledTimeUTC = utcStart.toISOString();
          
          if (jobData.end_time) {
            const utcEnd = combineDateTimeToUTC(
              jobData.scheduled_date, 
              jobData.end_time, 
              userTimezone
            );
            scheduledEndTimeUTC = utcEnd.toISOString();
            
            // Calculate duration in minutes
            durationMinutes = Math.max(1, Math.round(
              (utcEnd.getTime() - utcStart.getTime()) / (1000 * 60)
            ));
          } else {
            // Default 1 hour duration if no end time
            const utcEnd = new Date(utcStart.getTime() + (60 * 60 * 1000));
            scheduledEndTimeUTC = utcEnd.toISOString();
          }
          
          console.log(`Converted times: ${jobData.scheduled_date} ${jobData.start_time} -> ${scheduledTimeUTC}`);
          console.log(`Duration: ${durationMinutes} minutes`);
        } catch (error) {
          console.error('Error converting time:', error);
          toast({
            variant: "destructive",
            title: "Invalid time",
            description: `Please check your date and time format: ${error.message}`,
          });
          throw error;
        }
      }

      // Prepare job series data
      const seriesData = {
        title: jobData.title,
        description: jobData.description,
        customer_id: jobData.customer_id,
        customer_name: jobData.customer_name,
        service_type: jobData.service_type,
        start_date: jobData.scheduled_date,
        local_start_time: jobData.start_time || '08:00:00',
        duration_minutes: durationMinutes,
        priority: jobData.priority,
        assigned_to_user_id: jobData.assigned_to_user_id,
        estimated_cost: jobData.estimated_cost,
        actual_cost: jobData.actual_cost,
        completion_notes: jobData.completion_notes,
        is_recurring: jobData.is_recurring,
        rrule: jobData.is_recurring ? (jobData.rrule || 'FREQ=WEEKLY;INTERVAL=1') : null,
        until_date: jobData.until_date,
        timezone: userTimezone,
        status: jobData.status,
        active: true,
        // Include UTC timestamps for immediate occurrence creation
        scheduled_time_utc: scheduledTimeUTC,
        scheduled_end_time_utc: scheduledEndTimeUTC,
      };

      console.log('Prepared series data:', seriesData);

      // Create the job series (which will also create the occurrence)
      const result = await createJobSeries(seriesData);
      
      console.log('Job creation completed:', result);
      return result;
    } catch (error) {
      console.error('Error in createJob:', error);
      throw error;
    }
  };

  return {
    createJob,
  };
}