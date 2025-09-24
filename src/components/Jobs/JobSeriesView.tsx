import { useState } from 'react';
import { JobSeries } from '@/hooks/useJobManagement';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, DollarSign, User, FileText, Wrench, Edit, AlertTriangle, Repeat } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { formatInUserTimezone } from '@/lib/timezoneUtils';
import { format } from 'date-fns';

interface JobSeriesViewProps {
  jobSeries: JobSeries;
  onUpdate?: (seriesId: string, data: any) => Promise<any>;
}

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

export default function JobSeriesView({ jobSeries, onUpdate }: JobSeriesViewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const userTimezone = useUserTimezone();

  const handleToggleActive = async () => {
    if (onUpdate) {
      setIsLoading(true);
      try {
        const confirmText = jobSeries.active 
          ? 'Deactivating this job series will cancel all future scheduled occurrences. Completed occurrences will remain unchanged. Do you want to continue?'
          : 'Reactivating this job series will resume scheduling future occurrences. Do you want to continue?';
        
        const confirmed = window.confirm(confirmText);
        if (!confirmed) {
          setIsLoading(false);
          return;
        }
        
        await onUpdate(jobSeries.id, { active: !jobSeries.active });
      } catch (error) {
        console.error('Failed to update job series:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Job Series Alert */}
      <Alert>
        <Repeat className="h-4 w-4" />
        <AlertDescription>
          This is a recurring job series. Changes to the series status will affect all future scheduled occurrences.
        </AlertDescription>
      </Alert>

      {/* Header with Status Toggle */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-2xl font-bold text-foreground">{jobSeries.title}</h2>
            <Badge variant="secondary">Job Series</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={jobSeries.active ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}>
              {jobSeries.active ? 'Active' : 'Inactive'}
            </Badge>
            <Badge className={getPriorityColor(jobSeries.priority)}>
              {jobSeries.priority}
            </Badge>
            <Badge variant="outline">
              {jobSeries.completed_occurrences} / {jobSeries.total_occurrences} completed
            </Badge>
          </div>
        </div>
        {onUpdate && (
          <Button 
            onClick={handleToggleActive} 
            variant={jobSeries.active ? "destructive" : "default"} 
            className="ml-4"
            disabled={isLoading}
          >
            {jobSeries.active ? 'Deactivate Series' : 'Reactivate Series'}
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
              <p className="font-medium">{jobSeries.customer_name}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Start Date:</span>
              <p className="font-medium">{format(new Date(jobSeries.start_date), 'MMM d, yyyy')}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Start Time:</span>
              <p className="font-medium">{jobSeries.local_start_time}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Duration:</span>
              <p className="font-medium">{jobSeries.duration_minutes} minutes</p>
            </div>
            {jobSeries.until_date && (
              <div>
                <span className="text-sm text-muted-foreground">Until Date:</span>
                <p className="font-medium">{format(new Date(jobSeries.until_date), 'MMM d, yyyy')}</p>
              </div>
            )}
            {jobSeries.next_occurrence_date && (
              <div>
                <span className="text-sm text-muted-foreground">Next Occurrence:</span>
                <p className="font-medium">{formatInUserTimezone(jobSeries.next_occurrence_date, userTimezone, 'MMM d, yyyy h:mm a')}</p>
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
              <p className="font-medium">{jobSeries.service_type.replace('_', ' ')}</p>
            </div>
            {jobSeries.description && (
              <div>
                <span className="text-sm text-muted-foreground">Description:</span>
                <p className="font-medium">{jobSeries.description}</p>
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
            {jobSeries.estimated_cost && (
              <div>
                <span className="text-sm text-muted-foreground">Estimated Cost per Occurrence:</span>
                <p className="font-medium">${jobSeries.estimated_cost}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assignment and Recurrence */}
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
                {jobSeries.contractor_name || 'Unassigned'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Recurrence Pattern
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="text-sm text-muted-foreground">Recurrence Rule:</span>
              <p className="font-medium font-mono text-xs">{jobSeries.rrule}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Timezone:</span>
              <p className="font-medium">{jobSeries.timezone}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {jobSeries.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {jobSeries.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Series Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <span className="text-sm text-muted-foreground">Created:</span>
            <p className="font-medium">{formatInUserTimezone(jobSeries.created_at, userTimezone, 'MMM d, yyyy h:mm a')}</p>
          </div>
          {jobSeries.updated_at && (
            <div>
              <span className="text-sm text-muted-foreground">Last Updated:</span>
              <p className="font-medium">{formatInUserTimezone(jobSeries.updated_at, userTimezone, 'MMM d, yyyy h:mm a')}</p>
            </div>
          )}
          <div>
            <span className="text-sm text-muted-foreground">Series ID:</span>
            <p className="font-medium font-mono">{jobSeries.id}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}