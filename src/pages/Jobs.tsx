import { useState } from "react";
import { Plus, Search, Filter, Eye, Edit, Trash2 } from "lucide-react";
import Navigation from "@/components/Layout/Navigation";
import RoleIndicator from "@/components/Layout/RoleIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useJobs } from "@/hooks/useJobs";
import { useJobManagement, ManagedJob } from "@/hooks/useJobManagement";
import { useAuth } from "@/hooks/useAuth";
import JobView from "@/components/Jobs/JobView";
import JobForm from "@/components/Jobs/JobForm";
import { useToast } from "@/hooks/use-toast";

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

export default function Jobs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewJob, setViewJob] = useState<ManagedJob | null>(null);
  const [editJob, setEditJob] = useState<ManagedJob | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  
  const { createJob } = useJobs(); // Keep for creating new jobs
  const { allManagedJobs, loading, updateOneTimeJob, updateJobSeries, deleteOneTimeJob, deleteJobSeries } = useJobManagement();
  const { userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === 'business_admin';

  // Filter jobs based on search term
  const filteredJobs = allManagedJobs.filter(job => 
    job.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.service_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateJob = () => {
    setEditJob(null);
    setIsFormOpen(true);
  };

  const handleEditJob = (job: ManagedJob) => {
    setEditJob(job);
    setIsFormOpen(true);
  };

  const handleViewJob = (job: ManagedJob) => {
    setViewJob(job);
  };

  const handleDeleteJob = (jobId: string) => {
    setDeleteJobId(jobId);
  };

  const confirmDelete = async () => {
    if (!deleteJobId) return;
    
    const job = allManagedJobs.find(j => j.id === deleteJobId);
    if (!job) return;
    
    try {
      if (job.job_type === 'one_time') {
        await deleteOneTimeJob(deleteJobId);
      } else {
        await deleteJobSeries(deleteJobId);
      }
      setDeleteJobId(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error deleting job",
        description: error.message,
      });
    }
  };

  const handleFormSubmit = async (data: any) => {
    try {
      setFormLoading(true);
      if (editJob) {
        if (editJob.job_type === 'one_time') {
          await updateOneTimeJob(editJob.id, data);
        } else {
          await updateJobSeries(editJob.id, data);
        }
      } else {
        await createJob(data);
      }
      setIsFormOpen(false);
      setEditJob(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: editJob ? "Error updating job" : "Error creating job",
        description: error.message,
      });
    } finally {
      setFormLoading(false);
    }
  };

  const canEditJob = (job: ManagedJob) => {
    if (isAdmin) return true;
    return job.assigned_to_user_id === allManagedJobs[0]?.tenant_id;
  };

  const getJobStatus = (job: ManagedJob) => {
    if (job.job_type === 'job_series') {
      return job.active ? 'Active' : 'Inactive';
    }
    return job.status.replace('_', ' ');
  };

  const getJobStatusColor = (job: ManagedJob) => {
    if (job.job_type === 'job_series') {
      return job.active 
        ? 'bg-success text-success-foreground' 
        : 'bg-muted text-muted-foreground';
    }
    return getStatusColor(job.status);
  };

  const getJobDate = (job: ManagedJob) => {
    if (job.job_type === 'job_series') {
      return job.next_occurrence_date 
        ? new Date(job.next_occurrence_date).toLocaleDateString()
        : 'No upcoming';
    }
    return new Date(job.scheduled_date).toLocaleDateString();
  };

  const getJobValue = (job: ManagedJob) => {
    if (job.job_type === 'job_series') {
      return job.estimated_cost ? `~$${job.estimated_cost}/occurrence` : '-';
    }
    return job.actual_cost ? `$${job.actual_cost}` : job.estimated_cost ? `~$${job.estimated_cost}` : '-';
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="lg:ml-64">
        <div className="p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Jobs</h1>
                <p className="text-muted-foreground">Manage and track your field service jobs</p>
              </div>
              <RoleIndicator />
            </div>
            <Button 
              onClick={handleCreateJob}
              className="shadow-material-sm hover:shadow-material-md transition-shadow duration-fast"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Job
            </Button>
          </div>

          {/* Filters */}
          <Card className="mb-6 shadow-material-md">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search jobs, customers, or services..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" className="sm:w-auto">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Jobs Table */}
          <Card className="shadow-material-md">
            <CardHeader>
              <CardTitle>All Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    // Loading skeleton
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="h-4 bg-muted rounded animate-pulse"></div></TableCell>
                        <TableCell><div className="h-4 bg-muted rounded animate-pulse"></div></TableCell>
                        <TableCell><div className="h-4 bg-muted rounded animate-pulse"></div></TableCell>
                        <TableCell><div className="h-4 bg-muted rounded animate-pulse"></div></TableCell>
                        <TableCell><div className="h-4 bg-muted rounded animate-pulse"></div></TableCell>
                        <TableCell><div className="h-4 bg-muted rounded animate-pulse"></div></TableCell>
                        <TableCell><div className="h-4 bg-muted rounded animate-pulse"></div></TableCell>
                      </TableRow>
                    ))
                  ) : filteredJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {searchTerm ? `No jobs found matching "${searchTerm}"` : "No jobs found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                     filteredJobs.map((job) => (
                       <TableRow 
                         key={job.id} 
                         className="cursor-pointer hover:bg-muted/50"
                         onClick={() => handleViewJob(job)}
                       >
                         <TableCell>{job.customer_name}</TableCell>
                         <TableCell>
                           <div className="flex items-center gap-2">
                             {job.title}
                             {job.job_type === 'job_series' && (
                               <Badge variant="secondary" className="text-xs">
                                 Series ({job.total_occurrences} total, {job.completed_occurrences} completed)
                               </Badge>
                             )}
                           </div>
                         </TableCell>
                         <TableCell>
                           <Badge variant="outline" className="text-xs">
                             {job.job_type === 'one_time' ? 'One-time' : 'Series'}
                           </Badge>
                         </TableCell>
                         <TableCell>
                           <Badge className={`${getJobStatusColor(job)}`}>
                             {getJobStatus(job)}
                           </Badge>
                         </TableCell>
                         <TableCell>{getJobDate(job)}</TableCell>
                         <TableCell>{job.contractor_name || 'Unassigned'}</TableCell>
                         <TableCell className="font-medium">
                           {getJobValue(job)}
                         </TableCell>
                       </TableRow>
                     ))
                   )}
                 </TableBody>
               </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Job View Modal */}
      <Dialog open={!!viewJob} onOpenChange={() => setViewJob(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
          </DialogHeader>
          {viewJob && (
            <JobView 
              job={viewJob} 
              onUpdate={viewJob.job_type === 'one_time' ? updateOneTimeJob : updateJobSeries} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Job Form Modal - Remove since editing is now in JobView */}
      {isFormOpen && !viewJob && (
        <Dialog open={isFormOpen} onOpenChange={() => setIsFormOpen(false)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Job</DialogTitle>
              <div className="sr-only">
                Fill out the form below to create a new job with all the necessary details.
              </div>
            </DialogHeader>
            <JobForm
              onSubmit={handleFormSubmit}
              onCancel={() => setIsFormOpen(false)}
              loading={formLoading}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteJobId} onOpenChange={() => setDeleteJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the job.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}