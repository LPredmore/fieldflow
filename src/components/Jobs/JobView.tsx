import { useState } from 'react';
import { UnifiedJob } from '@/hooks/useUnifiedJobs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, DollarSign, User, FileText, Wrench, Edit, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import JobForm from '@/components/Jobs/JobForm';

interface JobViewProps {
  job: UnifiedJob;
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
            job.job_type === 'recurring_instance' && 
            job.status !== 'cancelled') {
          const confirmCancel = window.confirm(
            'Cancelling this recurring job will also cancel all future occurrences in the series. Completed jobs will remain unchanged. Do you want to continue?'
          );
          if (!confirmCancel) {
            setIsLoading(false);
            return;
          }
        }
        
        await onUpdate(job.id, formData);
        setIsEditing(false);
      } catch (error) {
        console.error('Failed to update job:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (isEditing) {
    return (
      <JobForm
        job={job}
        onSubmit={handleSaveEdit}
        onCancel={handleCancelEdit}
        loading={isLoading}
      />
    );
  }
  return (
    <div className="space-y-6">
      {/* Job Type Alert for Recurring Jobs */}
      {job.job_type === 'recurring_instance' && (
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
            <h2 className="text-2xl font-bold text-foreground">{job.title}</h2>
            {job.job_type === 'recurring_instance' && (
              <Badge variant="secondary">Recurring</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={getStatusColor(job.status)}>
              {job.status.replace('_', ' ')}
            </Badge>
            <Badge className={getPriorityColor(job.priority)}>
              {job.priority}
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
              <p className="font-medium">{job.customer_name}</p>
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
              <p className="font-medium">{new Date(job.start_at).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">End Date & Time:</span>
              <p className="font-medium">{new Date(job.end_at).toLocaleString()}</p>
            </div>
            {job.estimated_duration && (
              <div>
                <span className="text-sm text-muted-foreground">Estimated Duration:</span>
                <p className="font-medium">{job.estimated_duration} hours</p>
              </div>
            )}
            {job.complete_date && (
              <div>
                <span className="text-sm text-muted-foreground">Completion Date:</span>
                <p className="font-medium">{new Date(job.complete_date).toLocaleDateString()}</p>
              </div>
            )}
            {job.series_id && (
              <div>
                <span className="text-sm text-muted-foreground">Series ID:</span>
                <p className="font-medium font-mono text-xs">{job.series_id.slice(0, 8)}...</p>
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
              <p className="font-medium">{job.service_type.replace('_', ' ')}</p>
            </div>
            {job.description && (
              <div>
                <span className="text-sm text-muted-foreground">Description:</span>
                <p className="font-medium">{job.description}</p>
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
            {job.estimated_cost && (
              <div>
                <span className="text-sm text-muted-foreground">Estimated Cost:</span>
                <p className="font-medium">${job.estimated_cost}</p>
              </div>
            )}
            {job.actual_cost && (
              <div>
                <span className="text-sm text-muted-foreground">Actual Cost:</span>
                <p className="font-medium">${job.actual_cost}</p>
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
                {job.contractor_name || 'Unassigned'}
              </p>
            </div>
          </CardContent>
        </Card>

        {job.additional_info && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Additional Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">
                {job.additional_info}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Completion Notes */}
      {job.completion_notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Completion Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{job.completion_notes}</p>
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
            <p className="font-medium">{new Date(job.created_at).toLocaleString()}</p>
          </div>
          {job.updated_at && (
            <div>
              <span className="text-sm text-muted-foreground">Last Updated:</span>
              <p className="font-medium">{new Date(job.updated_at).toLocaleString()}</p>
            </div>
          )}
          <div>
            <span className="text-sm text-muted-foreground">Job ID:</span>
            <p className="font-medium font-mono">{job.id}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}