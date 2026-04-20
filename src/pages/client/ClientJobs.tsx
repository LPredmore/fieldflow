import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Briefcase, Calendar as CalendarIcon, ImageIcon, MapPin, Clock, CheckCircle2, AlertCircle, XCircle, PlayCircle } from 'lucide-react';
import { format } from 'date-fns';

interface ClientJobOccurrence {
  id: string;
  series_id: string;
  start_at: string;
  end_at: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  override_title: string | null;
  override_description: string | null;
  completion_notes: string | null;
  series_title?: string;
  series_description?: string;
  service_type?: string;
}

interface JobFile {
  id: string;
  entity_id: string;
  entity_type: 'job_series' | 'job_occurrence' | 'quote' | 'invoice';
  bucket_id: string;
  storage_path: string;
  file_kind: string;
  caption: string | null;
  created_at: string;
  signedUrl?: string;
}

const statusConfig = {
  scheduled: { label: 'Scheduled', icon: CalendarIcon, color: 'bg-blue-100 text-blue-800 border-blue-200' },
  in_progress: { label: 'In Progress', icon: PlayCircle, color: 'bg-amber-100 text-amber-800 border-amber-200' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'bg-muted text-muted-foreground border-border' },
};

export default function ClientJobs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ClientJobOccurrence[]>([]);
  const [filesByJob, setFilesByJob] = useState<Record<string, JobFile[]>>({});
  const [activeTab, setActiveTab] = useState('all');
  const [previewFile, setPreviewFile] = useState<JobFile | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchJobsAndFiles();
  }, [user]);

  const fetchJobsAndFiles = async () => {
    try {
      setLoading(true);

      // Fetch occurrences with their parent series info (RLS scopes to client)
      const { data: occurrences, error: occErr } = await supabase
        .from('job_occurrences')
        .select(`
          id,
          series_id,
          start_at,
          end_at,
          status,
          override_title,
          override_description,
          completion_notes,
          customer_id,
          job_series:series_id ( title, description, service_type )
        `)
        .order('start_at', { ascending: false });

      if (occErr) throw occErr;

      const transformed: ClientJobOccurrence[] = (occurrences || []).map((o: any) => ({
        id: o.id,
        series_id: o.series_id,
        start_at: o.start_at,
        end_at: o.end_at,
        status: o.status,
        override_title: o.override_title,
        override_description: o.override_description,
        completion_notes: o.completion_notes,
        series_title: o.job_series?.title,
        series_description: o.job_series?.description,
        service_type: o.job_series?.service_type,
      }));

      setJobs(transformed);

      // Collect entity ids for file lookup (both occurrences and their series)
      const occurrenceIds = transformed.map(j => j.id);
      const seriesIds = Array.from(new Set(transformed.map(j => j.series_id)));

      if (occurrenceIds.length === 0 && seriesIds.length === 0) {
        setFilesByJob({});
        return;
      }

      // Fetch photo files for these jobs (RLS allows clients to view files on their own jobs)
      const { data: files, error: filesErr } = await supabase
        .from('job_files')
        .select('id, entity_id, entity_type, bucket_id, storage_path, file_kind, caption, created_at')
        .in('file_kind', ['photo_before', 'photo_after', 'photo_during'])
        .or(
          `and(entity_type.eq.job_occurrence,entity_id.in.(${occurrenceIds.join(',')})),and(entity_type.eq.job_series,entity_id.in.(${seriesIds.join(',')}))`
        );

      if (filesErr) {
        console.warn('Error fetching job files:', filesErr);
      }

      // Generate signed URLs and group by occurrence id
      const grouped: Record<string, JobFile[]> = {};

      const filesWithUrls = await Promise.all(
        (files || []).map(async (f: any) => {
          const { data: urlData } = await supabase.storage
            .from(f.bucket_id)
            .createSignedUrl(f.storage_path, 3600);
          return { ...f, signedUrl: urlData?.signedUrl } as JobFile;
        })
      );

      // Map files: occurrence-level files attach to that job; series-level files attach to all occurrences in series
      transformed.forEach(job => {
        const occFiles = filesWithUrls.filter(
          f => f.entity_type === 'job_occurrence' && f.entity_id === job.id
        );
        const seriesFiles = filesWithUrls.filter(
          f => f.entity_type === 'job_series' && f.entity_id === job.series_id
        );
        grouped[job.id] = [...occFiles, ...seriesFiles];
      });

      setFilesByJob(grouped);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading jobs',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = useMemo(() => {
    if (activeTab === 'all') return jobs;
    return jobs.filter(j => j.status === activeTab);
  }, [jobs, activeTab]);

  const counts = useMemo(() => ({
    all: jobs.length,
    scheduled: jobs.filter(j => j.status === 'scheduled').length,
    in_progress: jobs.filter(j => j.status === 'in_progress').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    cancelled: jobs.filter(j => j.status === 'cancelled').length,
  }), [jobs]);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto pt-16 lg:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Briefcase className="h-8 w-8 text-primary" />
          My Jobs
        </h1>
        <p className="text-muted-foreground mt-1">Your service history with photos from each visit.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled ({counts.scheduled})</TabsTrigger>
          <TabsTrigger value="in_progress">Active ({counts.in_progress})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({counts.completed})</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled ({counts.cancelled})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6 space-y-4">
          {loading ? (
            <>
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </>
          ) : filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">No jobs found in this category.</p>
              </CardContent>
            </Card>
          ) : (
            filteredJobs.map(job => {
              const cfg = statusConfig[job.status];
              const StatusIcon = cfg.icon;
              const photos = filesByJob[job.id] || [];
              const title = job.override_title || job.series_title || 'Service Job';
              const description = job.override_description || job.series_description;

              return (
                <Card key={job.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {title}
                          <Badge variant="outline" className={cfg.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {cfg.label}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            {format(new Date(job.start_at), 'MMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(job.start_at), 'h:mm a')}
                          </span>
                          {job.service_type && (
                            <span className="flex items-center gap-1 capitalize">
                              <MapPin className="h-3.5 w-3.5" />
                              {job.service_type.replace('_', ' ')}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {description && (
                      <p className="text-sm text-muted-foreground mb-4">{description}</p>
                    )}
                    {job.completion_notes && (
                      <div className="mb-4 p-3 rounded-md bg-accent border border-border">
                        <p className="text-xs font-semibold text-foreground mb-1">Completion Notes</p>
                        <p className="text-sm text-muted-foreground">{job.completion_notes}</p>
                      </div>
                    )}

                    {/* Photo Gallery */}
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Photos ({photos.length})
                        </p>
                      </div>
                      {photos.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No photos uploaded for this job.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {photos.map(photo => (
                            <button
                              key={photo.id}
                              onClick={() => setPreviewFile(photo)}
                              className="relative aspect-square rounded-md overflow-hidden bg-muted border border-border hover:ring-2 hover:ring-primary transition group"
                            >
                              {photo.signedUrl ? (
                                <img
                                  src={photo.signedUrl}
                                  alt={photo.caption || photo.file_kind}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <AlertCircle className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 capitalize">
                                {photo.file_kind.replace('photo_', '')}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Photo preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {previewFile?.file_kind.replace('photo_', 'Photo — ')}
            </DialogTitle>
          </DialogHeader>
          {previewFile?.signedUrl && (
            <div className="rounded-md overflow-hidden bg-muted">
              <img
                src={previewFile.signedUrl}
                alt={previewFile.caption || previewFile.file_kind}
                className="w-full h-auto max-h-[75vh] object-contain"
              />
            </div>
          )}
          {previewFile?.caption && (
            <p className="text-sm text-muted-foreground mt-2">{previewFile.caption}</p>
          )}
          {previewFile && (
            <p className="text-xs text-muted-foreground">
              Uploaded {format(new Date(previewFile.created_at), 'MMM d, yyyy')}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
