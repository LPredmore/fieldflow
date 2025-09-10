import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { hexToHsl } from "@/lib/colorUtils";
import { useSettings } from "@/hooks/useSettings";

const formSchema = z.object({
  business_name: z.string().min(1, "Business name is required"),
  business_phone: z.string().optional(),
  business_email: z.string().email("Invalid email address").optional(),
  business_website: z.string().optional(),
  logo_url: z.string().optional(),
  brand_color: z.string().optional(),
  text_color: z.string().optional(),
  business_address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip_code: z.string().optional(),
    country: z.string().default("USA"),
  }).optional(),
});

type FormData = z.infer<typeof formSchema>;

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

export default function BusinessSettings() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { settings, loading, updateSettings, createSettings } = useSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      business_name: "",
      business_phone: "",
      business_email: "",
      business_website: "",
      logo_url: "",
      brand_color: "#3B82F6",
      text_color: "#FFFFFF",
      business_address: {
        street: "",
        city: "",
        state: "",
        zip_code: "",
        country: "USA",
      },
    },
  });

  // Watch form values for real-time updates
  const brandColor = form.watch('brand_color');
  const textColor = form.watch('text_color');

  // Apply colors in real-time as user selects them
  useEffect(() => {
    if (brandColor || textColor) {
      const root = document.documentElement;
      
      if (brandColor) {
        const hsl = hexToHsl(brandColor);
        if (hsl) {
          root.style.setProperty('--primary', hsl);
        }
      }
      
      if (textColor) {
        const textHsl = hexToHsl(textColor);
        if (textHsl) {
          root.style.setProperty('--primary-foreground', textHsl);
        }
      }
    }
  }, [brandColor, textColor]);

  useEffect(() => {
    if (settings) {
      form.reset({
        business_name: settings.business_name || "",
        business_phone: settings.business_phone || "",
        business_email: settings.business_email || "",
        business_website: settings.business_website || "",
        logo_url: settings.logo_url || "",
        brand_color: settings.brand_color || "#3B82F6",
        text_color: settings.text_color || "#FFFFFF",
        business_address: settings.business_address || {
          street: "",
          city: "",
          state: "",
          zip_code: "",
          country: "USA",
        },
      });
    }
  }, [settings, form]);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // For now, we'll use a simple file URL (in production, you'd upload to Supabase Storage)
    const reader = new FileReader();
    reader.onload = (e) => {
      const logoUrl = e.target?.result as string;
      form.setValue('logo_url', logoUrl);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      if (settings) {
        await updateSettings(data);
      } else {
        await createSettings(data);
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
    <Card>
      <CardHeader>
        <CardTitle>Business Profile Settings</CardTitle>
        <CardDescription>
          Configure your company information and branding
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="business_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Business Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="business_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="business_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="contact@business.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="business_website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder="https://www.business.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Branding */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Branding</h3>
              
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Logo</label>
                  <div className="relative border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                    {form.watch('logo_url') ? (
                      <div className="space-y-2">
                        <img 
                          src={form.watch('logo_url')} 
                          alt="Company Logo" 
                          className="h-16 mx-auto object-contain"
                        />
                        <p className="text-sm text-muted-foreground">Logo uploaded</p>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => form.setValue('logo_url', '')}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          SVG, PNG, JPG or GIF (max. 800x400px)
                        </p>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="brand_color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Brand Color</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input type="color" className="w-16 h-10" {...field} />
                          </FormControl>
                          <FormControl>
                            <Input placeholder="#3B82F6" {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="text_color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Text Color (Over Brand Color)</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input type="color" className="w-16 h-10" {...field} />
                          </FormControl>
                          <FormControl>
                            <Input placeholder="#FFFFFF" {...field} />
                          </FormControl>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Color for text that appears over the brand color background
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Business Address</h3>
              
              <FormField
                control={form.control}
                name="business_address.street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main Street" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="business_address.city"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="City" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="business_address.state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" {...field}>
                          <option value="">Select State</option>
                          {US_STATES.map((state) => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="business_address.zip_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ZIP Code</FormLabel>
                      <FormControl>
                        <Input placeholder="12345" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

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
      </CardContent>
    </Card>
  );
}