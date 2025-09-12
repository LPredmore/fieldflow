import { Job } from '@/hooks/useJobs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, DollarSign, User, FileText, Wrench } from 'lucide-react';

interface JobViewProps {
  job: Job;
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

export default function JobView({ job }: JobViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{job.title}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge className={getStatusColor(job.status)}>
            {job.status.replace('_', ' ')}
          </Badge>
          <Badge className={getPriorityColor(job.priority)}>
            {job.priority}
          </Badge>
        </div>
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
              <span className="text-sm text-muted-foreground">Date:</span>
              <p className="font-medium">{new Date(job.scheduled_date).toLocaleDateString()}</p>
            </div>
            {job.scheduled_time && (
              <div>
                <span className="text-sm text-muted-foreground">Time:</span>
                <p className="font-medium">{job.scheduled_time}</p>
              </div>
            )}
            {job.estimated_duration && (
              <div>
                <span className="text-sm text-muted-foreground">Estimated Duration:</span>
                <p className="font-medium">{job.estimated_duration} hours</p>
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

        {job.materials_needed && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Materials Needed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap font-mono bg-muted p-2 rounded">
                {JSON.stringify(job.materials_needed, null, 2)}
              </pre>
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