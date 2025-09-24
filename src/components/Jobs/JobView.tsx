import { useState } from 'react';
import { UnifiedJob } from '@/hooks/useUnifiedJobs';
import { JobSeries, OneTimeJob } from '@/hooks/useJobManagement';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, DollarSign, User, FileText, Wrench, Edit, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import JobForm from '@/components/Jobs/JobForm';
import JobSeriesView from '@/components/Jobs/JobSeriesView';
import { combineDateTimeToUTC } from '@/lib/timezoneUtils';
import { useUserTimezone } from '@/hooks/useUserTimezone';

interface JobViewProps {
  job: UnifiedJob | OneTimeJob | JobSeries;
  onUpdate?: (jobId: string, data: any) => Promise<any>;
}

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'bg-success text-success-foreground';
    case 'in progress':
    case 'in_progress':
      return 'bg-warning text-warning-foreground';
    case 'scheduled':
      return 'bg-primary text-primary-foreground';
    case 'cancelled':
      return 'bg-destructive text-destructive-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case 'urgent':
      return 'bg-destructive text-destructive-foreground';
    case 'high':
      return 'bg-warning text-warning-foreground';
    case 'medium':
      return 'bg-primary text-primary-foreground';
    case 'low':
      return 'bg-muted text-muted-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export default function JobView({ job, onUpdate }: JobViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const userTimezone = useUserTimezone();

  // For one-time jobs, unified jobs, and job series, use the same editing logic
  const unifiedJob = job as UnifiedJob | OneTimeJob | JobSeries;

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async (formData: any) => {
    if (onUpdate) {
      setIsLoading(true);
      try {
        // Show warning for recurring job cancellation
        if (formData.status === 'cancelled' && 
            'job_type' in unifiedJob &&
            unifiedJob.job_type === 'recurring_instance' && 
            'status' in unifiedJob &&
            unifiedJob.status !== 'cancelled') {
          const confirmCancel = window.confirm(
            'Cancelling this recurring job will also cancel all future occurrences in the series. Completed jobs will remain unchanged. Do you want to continue?'
          );
          if (!confirmCancel) {
            setIsLoading(false);
            return;
          }
        }
        
        // Transform form data for update - remove form-specific fields
        const {
          start_time,
          end_time,
          is_recurring,
          rrule,
          until_date,
          scheduled_time_utc,
          scheduled_end_time_utc,
          ...updateData
        } = formData;
        
        // For recurring job series, detect scheduling changes that require occurrence regeneration
        if ('job_type' in job && job.job_type === 'job_series') {
          const jobSeries = job as JobSeries;
          
          const jobTimezone = formData.timezone || jobSeries.timezone || userTimezone;
          
          // Check if scheduling fields have changed
          const schedulingFieldsChanged = 
            formData.scheduled_date !== jobSeries.start_date ||
            formData.start_time !== jobSeries.local_start_time ||
            formData.duration_minutes !== jobSeries.duration_minutes ||
            formData.timezone !== jobSeries.timezone ||
            formData.rrule !== jobSeries.rrule ||
            formData.until_date !== jobSeries.until_date;
          
          if (schedulingFieldsChanged && formData.scheduled_date && formData.start_time) {
            try {
              // Compute UTC timestamps for the new schedule
              const durationMinutes = formData.duration_minutes || jobSeries.duration_minutes || 60;
              const utcStart = combineDateTimeToUTC(formData.scheduled_date, formData.start_time, jobTimezone);
              const utcEnd = new Date(utcStart.getTime() + durationMinutes * 60000);
              
              // Include computed UTC timestamps and reschedule flag
              updateData.scheduled_time_utc = utcStart.toISOString();
              updateData.scheduled_end_time_utc = utcEnd.toISOString();
              updateData.start_date = formData.scheduled_date;
              updateData.local_start_time = formData.start_time;
              updateData.duration_minutes = formData.duration_minutes;
              updateData.timezone = jobTimezone;
              updateData.rescheduleOccurrences = true; // Flag for regenerating occurrences
              
              if (formData.rrule) updateData.rrule = formData.rrule;
              if (formData.until_date) updateData.until_date = formData.until_date;
            } catch (error) {
              console.error('Error computing UTC timestamps for recurring job:', error);
            }
          }
        }
        // For one-time jobs, compute and include UTC timestamps when timing changes
        else if ('start_date' in unifiedJob || 'scheduled_date' in unifiedJob) {
          const jobTimezone = formData.timezone || ('timezone' in unifiedJob ? unifiedJob.timezone : userTimezone);
          
          // Check if timing has changed - compare with current values
          const currentStartDate = 'start_date' in unifiedJob ? unifiedJob.start_date : formData.scheduled_date;
          const currentStartTime = 'local_start_time' in unifiedJob ? unifiedJob.local_start_time : formData.start_time;
          
          const timingChanged = formData.scheduled_date !== currentStartDate || 
                               formData.start_time !== currentStartTime ||
                               formData.duration_minutes !== ('duration_minutes' in unifiedJob ? unifiedJob.duration_minutes : unifiedJob.estimated_duration);
          
          if (timingChanged && formData.scheduled_date && formData.start_time) {
            try {
              // Compute UTC timestamps for the update
              const durationMinutes = formData.duration_minutes || ('duration_minutes' in unifiedJob ? unifiedJob.duration_minutes : unifiedJob.estimated_duration) || 60;
              const utcStart = combineDateTimeToUTC(formData.scheduled_date, formData.start_time, jobTimezone);
              const utcEnd = new Date(utcStart.getTime() + durationMinutes * 60000);
              
              // Include computed UTC timestamps
              updateData.scheduled_time_utc = utcStart.toISOString();
              updateData.scheduled_end_time_utc = utcEnd.toISOString();
              updateData.start_date = formData.scheduled_date;
              updateData.local_start_time = formData.start_time;
              updateData.duration_minutes = formData.duration_minutes;
              updateData.timezone = jobTimezone;
            } catch (error) {
              console.error('Error computing UTC timestamps:', error);
            }
          }
        }
        
        // Ensure assigned_to_user_id is properly handled
        if (formData.assigned_to_user_id !== undefined) {
          updateData.assigned_to_user_id = formData.assigned_to_user_id;
        }
        
        await onUpdate(unifiedJob.id, updateData);
        setIsEditing(false);
      } catch (error) {
        console.error('Failed to update job:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (isEditing) {
    // Convert OneTimeJob to UnifiedJob format if needed
    const jobForForm = 'start_at' in unifiedJob ? unifiedJob : (() => {
      const timezone = ('timezone' in unifiedJob ? unifiedJob.timezone : undefined) || userTimezone;
      const localTime = unifiedJob.local_start_time || '08:00';
      const startTimeFormatted = localTime.substring(0, 5); // HH:mm format
      const utcStart = combineDateTimeToUTC(unifiedJob.start_date, startTimeFormatted, timezone);
      const utcEnd = new Date(utcStart.getTime() + (unifiedJob.duration_minutes || 60) * 60000);
      
      return {
        ...unifiedJob,
        start_at: utcStart.toISOString(),
        end_at: utcEnd.toISOString(),
        job_type: 'one_time' as const,
        timezone: timezone,
        // Ensure assigned_to_user_id is properly passed for contractor binding
        assigned_to_user_id: unifiedJob.assigned_to_user_id
      };
    })();

    return (
      <JobForm
        job={jobForForm}
        onSubmit={handleSaveEdit}
        onCancel={handleCancelEdit}
        loading={isLoading}
      />
    );
  }

  // Helper function to safely get start_at for display
  const getStartDateTime = () => {
    if ('start_at' in unifiedJob) {
      return unifiedJob.start_at;
    }
    if ('start_date' in unifiedJob) {
      const time = unifiedJob.local_start_time || '08:00';
      const startTimeFormatted = time.substring(0, 5); // HH:mm format
      const timezone = ('timezone' in unifiedJob ? unifiedJob.timezone : undefined) || userTimezone;
      
      try {
        const utcStart = combineDateTimeToUTC(unifiedJob.start_date, startTimeFormatted, timezone);
        return utcStart.toISOString();
      } catch (error) {
        console.error('Error converting start date to UTC:', error);
        return new Date().toISOString();
      }
    }
    return new Date().toISOString();
  };

  // Helper function to safely get end_at for display
  const getEndDateTime = () => {
    if ('end_at' in unifiedJob) {
      return unifiedJob.end_at;
    }
    if ('start_date' in unifiedJob) {
      const time = unifiedJob.local_start_time || '08:00';
      const startTimeFormatted = time.substring(0, 5); // HH:mm format
      const timezone = ('timezone' in unifiedJob ? unifiedJob.timezone : undefined) || userTimezone;
      
      try {
        const utcStart = combineDateTimeToUTC(unifiedJob.start_date, startTimeFormatted, timezone);
        const utcEnd = new Date(utcStart.getTime() + (unifiedJob.duration_minutes || 60) * 60000);
        return utcEnd.toISOString();
      } catch (error) {
        console.error('Error converting end date to UTC:', error);
        return new Date().toISOString();
      }
    }
    return new Date().toISOString();
  };

  return (
    <div className="space-y-6">
      {/* Job Type Alert for Recurring Jobs */}
      {'job_type' in unifiedJob && unifiedJob.job_type === 'recurring_instance' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This is a recurring job instance. Changes to status (especially cancellation) may affect future occurrences in the series.
          </AlertDescription>
        </Alert>
      )}

      {/* Header with Edit Button */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-2xl font-bold text-foreground">{unifiedJob.title}</h2>
            {'job_type' in unifiedJob && unifiedJob.job_type === 'recurring_instance' && (
              <Badge variant="secondary">Recurring</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {'status' in unifiedJob && (
              <Badge className={getStatusColor(unifiedJob.status)}>
                {unifiedJob.status.replace('_', ' ')}
              </Badge>
            )}
            <Badge className={getPriorityColor(unifiedJob.priority)}>
              {unifiedJob.priority}
            </Badge>
          </div>
        </div>
        {onUpdate && (
          <Button onClick={handleEdit} variant="outline" className="ml-4">
            <Edit className="h-4 w-4 mr-2" />
            Edit Job
          </Button>
        )}
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-4 w-4" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Customer:</span>
              <p className="font-medium">{unifiedJob.customer_name}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Scheduling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Start Date & Time:</span>
              <p className="font-medium">{formatInUserTimezone(getStartDateTime(), userTimezone, 'MMM d, yyyy h:mm a')}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">End Date & Time:</span>
              <p className="font-medium">{formatInUserTimezone(getEndDateTime(), userTimezone, 'MMM d, yyyy h:mm a')}</p>
            </div>
            {'estimated_duration' in unifiedJob && unifiedJob.estimated_duration && (
              <div>
                <span className="text-sm text-muted-foreground">Estimated Duration:</span>
                <p className="font-medium">{unifiedJob.estimated_duration} hours</p>
              </div>
            )}
            {'complete_date' in unifiedJob && unifiedJob.complete_date && (
              <div>
                <span className="text-sm text-muted-foreground">Completion Date:</span>
                <p className="font-medium">{formatInUserTimezone(unifiedJob.complete_date, userTimezone, 'MMM d, yyyy')}</p>
              </div>
            )}
            {'series_id' in unifiedJob && unifiedJob.series_id && (
              <div>
                <span className="text-sm text-muted-foreground">Series ID:</span>
                <p className="font-medium font-mono text-xs">{unifiedJob.series_id.slice(0, 8)}...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Service and Assignment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Service Type:</span>
              <p className="font-medium">{unifiedJob.service_type.replace('_', ' ')}</p>
            </div>
            {unifiedJob.description && (
              <div>
                <span className="text-sm text-muted-foreground">Description:</span>
                <p className="font-medium">{unifiedJob.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Cost Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unifiedJob.estimated_cost && (
              <div>
                <span className="text-sm text-muted-foreground">Estimated Cost:</span>
                <p className="font-medium">${unifiedJob.estimated_cost}</p>
              </div>
            )}
            {'actual_cost' in unifiedJob && unifiedJob.actual_cost && (
              <div>
                <span className="text-sm text-muted-foreground">Actual Cost:</span>
                <p className="font-medium">${unifiedJob.actual_cost}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assignment and Materials */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-4 w-4" />
              Assignment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <span className="text-sm text-muted-foreground">Assigned Contractor:</span>
              <p className="font-medium">
                {unifiedJob.contractor_name || 'Unassigned'}
              </p>
              {unifiedJob.assigned_to_user_id && (
                <p className="text-xs text-muted-foreground font-mono">
                  ID: {unifiedJob.assigned_to_user_id.slice(0, 8)}...
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {'additional_info' in unifiedJob && unifiedJob.additional_info && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Additional Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {unifiedJob.additional_info}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Completion Notes */}
      {'completion_notes' in unifiedJob && unifiedJob.completion_notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Completion Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{unifiedJob.completion_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Job Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <span className="text-sm text-muted-foreground">Created:</span>
            <p className="font-medium">{formatInUserTimezone(unifiedJob.created_at, userTimezone, 'MMM d, yyyy h:mm a')}</p>
          </div>
          {unifiedJob.updated_at && (
            <div>
              <span className="text-sm text-muted-foreground">Last Updated:</span>
              <p className="font-medium">{formatInUserTimezone(unifiedJob.updated_at, userTimezone, 'MMM d, yyyy h:mm a')}</p>
            </div>
          )}
          <div>
            <span className="text-sm text-muted-foreground">Job ID:</span>
            <p className="font-medium font-mono">{unifiedJob.id}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}