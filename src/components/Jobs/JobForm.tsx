import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useEffect } from 'react';
import { UnifiedJob } from '@/hooks/useUnifiedJobs';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { combineDateTimeToUTC, splitUTCToLocalDateTime } from '@/lib/timezoneUtils';
import { canSupervise } from '@/utils/permissionUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ContractorSelector } from '@/components/Customers/ContractorSelector';
import { CustomerSelector } from '@/components/Customers/CustomerSelector';
import { RRuleBuilder } from './RRuleBuilder';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle } from 'lucide-react';

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  customer_id: z.string().min(1, 'Customer is required'),
  customer_name: z.string().min(1, 'Customer name is required'),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  scheduled_date: z.string().min(1, 'Start Date is required'),
  complete_date: z.string().transform((val) => val === '' ? null : val).optional(),
  assigned_to_user_id: z.string().optional(),
  service_type: z.enum(['plumbing', 'electrical', 'hvac', 'cleaning', 'landscaping', 'general_maintenance', 'other']),
  estimated_cost: z.coerce.number().optional(),
  actual_cost: z.coerce.number().optional(),
  additional_info: z.string().optional(),
  completion_notes: z.string().optional(),
  // Time fields
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  // Recurring job fields
  is_recurring: z.boolean().default(false),
  rrule: z.string().default('FREQ=WEEKLY;INTERVAL=1'),
  until_date: z.string().transform((val) => val === '' ? null : val).optional(),
  timezone: z.string().default('America/New_York'),
});

type JobFormData = z.infer<typeof jobSchema>;

interface JobFormProps {
  job?: UnifiedJob;
  onSubmit: (data: JobFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

interface ExtendedJob extends UnifiedJob {
  is_recurring?: boolean;
  rrule?: string;
  until_date?: string;
  timezone?: string;
}

export default function JobForm({ job, onSubmit, onCancel, loading }: JobFormProps) {
  const { user, userRole } = useAuth();
  const { permissions } = usePermissions();
  const userTimezone = useUserTimezone();
  const { toast } = useToast();
  const canAssignContractors = canSupervise(permissions);
  const extendedJob = job as ExtendedJob | undefined;

  // Convert existing job times from UTC to user's timezone for display
  const getInitialTimeValues = () => {
    if (job?.scheduled_time && job?.scheduled_date) {
      // Use scheduled fields if available
      return {
        date: job.scheduled_date,
        time: job.scheduled_time
      };
    } else if (job?.start_at) {
      // Convert from start_at if available
      const { date, time } = splitUTCToLocalDateTime(job.start_at, userTimezone);
      return { date, time };
    }
    return { 
      date: new Date().toISOString().split('T')[0], 
      time: '' 
    };
  };

  const initialValues = getInitialTimeValues();

  const form = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: job?.title || '',
      description: job?.description || '',
      customer_id: job?.customer_id || '',
      customer_name: job?.customer_name || '',
      status: job?.status || 'scheduled',
      priority: job?.priority || 'medium',
      scheduled_date: job?.scheduled_date || initialValues.date,
      complete_date: job?.complete_date || undefined, // Don't use empty string
      assigned_to_user_id: job?.assigned_to_user_id || user?.id,
      service_type: (job?.service_type as any) || 'general_maintenance',
      estimated_cost: job?.estimated_cost || undefined,
      actual_cost: job?.actual_cost || undefined,
      additional_info: job?.additional_info || '',
      completion_notes: job?.completion_notes || '',
      start_time: initialValues.time,
      end_time: '',
      is_recurring: extendedJob?.is_recurring || false,
      rrule: extendedJob?.rrule || 'FREQ=WEEKLY;INTERVAL=1',
      until_date: extendedJob?.until_date || undefined, // Don't use empty string
      timezone: userTimezone,
    },
  });

  // Auto-assign current user to new jobs once auth context loads
  useEffect(() => {
    const currentAssignedTo = form.getValues('assigned_to_user_id');
    
    // Only set if: no existing job (new job flow), field is empty, and user is available
    if (!job && !currentAssignedTo && user?.id) {
      form.setValue('assigned_to_user_id', user.id);
    }
  }, [user?.id, job, form]);

  const isRecurring = form.watch("is_recurring");

  const handleSubmit = async (data: JobFormData) => {
    try {
      console.log('Form data being submitted:', data);
      console.log('User timezone:', userTimezone);
      
      // Convert local date/time to UTC for storage
      let scheduledTimeUTC = null;
      let scheduledEndTimeUTC = null;
      
      if (data.start_time) {
        try {
          const utcStart = combineDateTimeToUTC(data.scheduled_date, data.start_time, userTimezone);
          scheduledTimeUTC = utcStart.toISOString();
          console.log(`Converted start time: ${data.scheduled_date} ${data.start_time} (${userTimezone}) -> ${scheduledTimeUTC}`);
        } catch (error) {
          console.error('Error converting start time:', error);
          toast({
            variant: "destructive",
            title: "Invalid start time",
            description: `Please check your date and time format: ${error.message}`,
          });
          return;
        }
      }
      
      if (data.end_time) {
        try {
          const utcEnd = combineDateTimeToUTC(data.scheduled_date, data.end_time, userTimezone);
          scheduledEndTimeUTC = utcEnd.toISOString();
          console.log(`Converted end time: ${data.scheduled_date} ${data.end_time} (${userTimezone}) -> ${scheduledEndTimeUTC}`);
        } catch (error) {
          console.error('Error converting end time:', error);
          toast({
            variant: "destructive",
            title: "Invalid end time",
            description: `Please check your date and time format: ${error.message}`,
          });
          return;
        }
      }
      
      // Clean up data for database submission
      const cleanedData = {
        ...data,
        // Convert empty strings to null for optional UUID and date fields
        assigned_to_user_id: data.assigned_to_user_id || null,
        customer_id: data.customer_id || null,
        complete_date: data.complete_date || null, // Convert empty string to null
        until_date: data.until_date || null, // Convert empty string to null
        // Remove any undefined or empty string values for numeric fields
        estimated_cost: data.estimated_cost || null,
        actual_cost: data.actual_cost || null,
        // Handle time fields - store as UTC
        scheduled_time_utc: scheduledTimeUTC,
        scheduled_end_time_utc: scheduledEndTimeUTC,
        // Keep original fields for backward compatibility
        scheduled_time: data.start_time || null,
        scheduled_end_time: data.end_time || null,
        // Include timezone for recurring jobs
        timezone: userTimezone,
      };
      
      console.log('Cleaned form data with timezone conversion:', cleanedData);
      await onSubmit(cleanedData);
    } catch (error) {
      console.error('Form submission error:', error);
      throw error;
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* Form Validation Errors */}
        {Object.keys(form.formState.errors).length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please fix the following errors:
              <ul className="list-disc list-inside mt-2">
                {Object.entries(form.formState.errors).map(([field, error]) => (
                  <li key={field} className="text-sm">
                    {field}: {error?.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter job title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the job details" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer</FormLabel>
                    <FormControl>
                      <CustomerSelector
                        value={field.value}
                        onValueChange={(customerId, customerName) => {
                          field.onChange(customerId);
                          form.setValue("customer_name", customerName);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

                <FormField
                  control={form.control}
                  name="service_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select service type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="plumbing">Plumbing</SelectItem>
                          <SelectItem value="electrical">Electrical</SelectItem>
                          <SelectItem value="hvac">HVAC</SelectItem>
                          <SelectItem value="cleaning">Cleaning</SelectItem>
                          <SelectItem value="landscaping">Landscaping</SelectItem>
                          <SelectItem value="general_maintenance">General Maintenance</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>
          </CardContent>
        </Card>

        {/* Scheduling */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="is_recurring"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Make this a recurring job</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Create a repeating schedule for this job
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scheduled_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isRecurring ? 'Start Date' : 'Scheduled Date'}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {!isRecurring && (
                <FormField
                  control={form.control}
                  name="complete_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Completed by</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Time Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time (optional)</FormLabel>
                    <FormControl>
                      <Input type="time" step={900} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time (optional)</FormLabel>
                    <FormControl>
                      <Input type="time" step={900} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Recurring Job Options */}
        {isRecurring && (
          <RRuleBuilder
            rrule={form.watch("rrule")}
            onChange={(rrule) => {
              console.log('RRule changed:', rrule);
              form.setValue("rrule", rrule);
            }}
            startDate={form.watch("scheduled_date")}
          />
        )}

        {/* Assignment */}
        <Card>
          <CardHeader>
            <CardTitle>Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            {canAssignContractors ? (
              <FormField
                control={form.control}
                name="assigned_to_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned Contractor</FormLabel>
                    <FormControl>
                      <ContractorSelector
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="space-y-2">
                <FormLabel className="text-muted-foreground">Assigned Contractor</FormLabel>
                <div className="p-3 rounded-md bg-muted border border-dashed">
                  <p className="text-sm text-muted-foreground">
                    You need Supervisor permission to assign contractors to jobs.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Information */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="estimated_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Cost</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="actual_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Actual Cost</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Materials and Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="additional_info"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Info</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder=""
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="completion_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Completion Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Add any completion notes here" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : job ? 'Update Job' : 'Create Job'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
