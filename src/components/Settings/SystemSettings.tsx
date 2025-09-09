import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

const formSchema = z.object({
  system_settings: z.object({
    automatic_backups: z.boolean(),
    data_retention_days: z.number().min(30).max(2555), // Max ~7 years
    require_job_photos: z.boolean(),
    customer_portal_enabled: z.boolean(),
  }),
});

type FormData = z.infer<typeof formSchema>;

export default function SystemSettings() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { settings, loading, updateSettings, createSettings } = useSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      system_settings: {
        automatic_backups: true,
        data_retention_days: 365,
        require_job_photos: false,
        customer_portal_enabled: false,
      },
    },
  });

  useEffect(() => {
    if (settings) {
      const systemSettings = settings.system_settings || {};

      form.reset({
        system_settings: {
          automatic_backups: systemSettings.automatic_backups ?? true,
          data_retention_days: systemSettings.data_retention_days || 365,
          require_job_photos: systemSettings.require_job_photos ?? false,
          customer_portal_enabled: systemSettings.customer_portal_enabled ?? false,
        },
      });
    }
  }, [settings, form]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      const updateData = {
        system_settings: data.system_settings,
      };

      if (settings) {
        await updateSettings(updateData);
      } else {
        await createSettings(updateData);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Data & Backup Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Data & Backup</CardTitle>
              <CardDescription>Configure data retention and backup preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="system_settings.automatic_backups"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Automatic Backups</FormLabel>
                      <FormDescription>
                        Automatically backup your data daily to ensure data safety
                      </FormDescription>
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

              <FormField
                control={form.control}
                name="system_settings.data_retention_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Retention (days)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="30"
                        max="2555"
                        placeholder="365" 
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 365)}
                      />
                    </FormControl>
                    <FormDescription>
                      How long to keep archived data (minimum 30 days, maximum ~7 years)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Job Requirements */}
          <Card>
            <CardHeader>
              <CardTitle>Job Requirements</CardTitle>
              <CardDescription>Configure mandatory requirements for job completion</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="system_settings.require_job_photos"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Require Job Photos</FormLabel>
                      <FormDescription>
                        Require photo uploads when marking jobs as completed
                      </FormDescription>
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
            </CardContent>
          </Card>

          {/* Customer Features */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Features</CardTitle>
              <CardDescription>Configure customer-facing features and access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="system_settings.customer_portal_enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5 flex-1">
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-base">Customer Portal</FormLabel>
                        <Badge variant="secondary">Coming Soon</Badge>
                      </div>
                      <FormDescription>
                        Allow customers to view quotes, invoices, and job status online
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={true}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving Changes...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}