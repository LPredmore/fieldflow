import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, MapPin, Clock } from "lucide-react";

const recentJobs = [
  {
    id: "JOB-2024-001",
    customer: "Sarah Johnson",
    service: "Plumbing Repair",
    address: "123 Oak Street, Springfield",
    status: "In Progress",
    priority: "High",
    scheduledTime: "2:00 PM - 4:00 PM",
    contractor: "Mike Wilson"
  },
  {
    id: "JOB-2024-002", 
    customer: "David Chen",
    service: "HVAC Maintenance",
    address: "456 Pine Avenue, Springfield",
    status: "Scheduled",
    priority: "Medium",
    scheduledTime: "9:00 AM - 11:00 AM",
    contractor: "Lisa Martinez"
  },
  {
    id: "JOB-2024-003",
    customer: "Emma Rodriguez",
    service: "Electrical Installation",
    address: "789 Maple Drive, Springfield", 
    status: "Completed",
    priority: "Low",
    scheduledTime: "1:00 PM - 3:00 PM",
    contractor: "Tom Anderson"
  }
];

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'bg-success text-success-foreground';
    case 'in progress':
      return 'bg-warning text-warning-foreground';
    case 'scheduled':
      return 'bg-primary text-primary-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
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
  return (
    <Card className="shadow-material-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Recent Jobs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recentJobs.map((job) => (
          <div 
            key={job.id}
            className="border border-border rounded-lg p-4 hover:shadow-material-sm transition-shadow duration-fast"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-foreground">{job.customer}</h4>
                  <Badge variant="outline" className="text-xs">
                    {job.id}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-primary">{job.service}</p>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{job.address}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${getStatusColor(job.status)}`}>
                  {job.status}
                </Badge>
                <Badge variant="outline" className={`text-xs ${getPriorityColor(job.priority)}`}>
                  {job.priority}
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {job.scheduledTime}
              </div>
            </div>
            
            <div className="mt-2 text-xs text-muted-foreground">
              Assigned to: <span className="font-medium">{job.contractor}</span>
            </div>
          </div>
        ))}
        
        <div className="pt-2">
          <Button variant="outline" className="w-full">
            View All Jobs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}