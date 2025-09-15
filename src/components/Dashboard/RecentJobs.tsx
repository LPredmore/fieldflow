import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, MapPin, Clock } from "lucide-react";
import { useUnifiedJobs } from "@/hooks/useUnifiedJobs";
import { useNavigate } from "react-router-dom";

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
      return 'bg-destructive text-destructive-foreground';
    case 'medium':
      return 'bg-warning text-warning-foreground';
    case 'low':
      return 'bg-success text-success-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export default function RecentJobs() {
  const { upcomingJobs, loading } = useUnifiedJobs();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card className="shadow-material-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">Recent Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-border rounded-lg p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-material-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Upcoming Jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcomingJobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No jobs found</p>
            <p className="text-sm">Create your first job to get started</p>
          </div>
        ) : (
          upcomingJobs.map((job) => (
            <div 
              key={job.id}
              className="border border-border rounded-lg p-4 hover:shadow-material-sm transition-shadow duration-fast"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                   <div className="flex items-center gap-2 mb-1">
                     <h4 className="font-medium text-foreground">{job.customer_name}</h4>
                     <Badge variant="outline" className="text-xs">
                       {job.id.slice(0, 8)}
                     </Badge>
                     {job.job_type === 'recurring_instance' && (
                       <Badge variant="secondary" className="text-xs">
                         Recurring
                       </Badge>
                     )}
                   </div>
                   <p className="text-sm font-medium text-primary">{job.title}</p>
                  {job.description && (
                    <p className="text-xs text-muted-foreground mt-1">{job.description}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm">
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${getStatusColor(job.status.replace('_', ' '))}`}>
                    {job.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline" className={`text-xs ${getPriorityColor(job.priority)}`}>
                    {job.priority}
                  </Badge>
                </div>
                 <div className="flex items-center gap-1 text-xs text-muted-foreground">
                   <Clock className="h-3 w-3" />
                   {new Date(job.start_at).toLocaleTimeString('en-US', { 
                     hour: 'numeric', 
                     minute: '2-digit',
                     hour12: true 
                   })}
                 </div>
              </div>
              
               <div className="mt-2 text-xs text-muted-foreground">
                 Scheduled: <span className="font-medium">{new Date(job.start_at).toLocaleDateString()}</span>
               </div>
            </div>
          ))
        )}
        
        <div className="pt-2">
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate('/jobs')}
          >
            View All Jobs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}