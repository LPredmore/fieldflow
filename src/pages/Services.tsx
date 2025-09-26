import { useState, useRef } from "react";
import { Search, Plus, MoreHorizontal, Edit, Trash2, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import PriceProModal from "@/components/PriceProModal";
import { toast } from "sonner";
import { useServices } from "@/hooks/useServices";
import { useSettings } from "@/hooks/useSettings";

const formSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  price_per_unit: z.string().min(1, "Price is required"),
  unit_type: z.string().min(1, "Unit type is required"),
  taxable: z.boolean().default(true),
});

export default function Services() {
  // Use the services hook for database operations
  const { services, loading, createService, updateService, deleteService } = useServices();
  const { settings } = useSettings();
  
  // State management for UI interactions
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPriceProOpen, setIsPriceProOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [deletingService, setDeletingService] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Filter services based on search term for improved user experience
  const filteredServices = services.filter(service =>
    service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (service.description && service.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (service.category && service.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Form setup with validation schema
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      price_per_unit: "",
      unit_type: "",
      taxable: true,
    },
  });

  // Service management functions for creating, editing, and deleting services
  const handleCreateService = () => {
    form.reset({
      name: "",
      description: "",
      category: "",
      price_per_unit: "",
      unit_type: "",
      taxable: true,
    });
    setEditingService(null);
    setIsCreateModalOpen(true);
  };

  const handleEditService = (service: any) => {
    setEditingService(service);
    form.reset({
      name: service.name,
      description: service.description || "",
      category: service.category || "",
      price_per_unit: service.price_per_unit.toString(),
      unit_type: service.unit_type,
      taxable: service.taxable ?? true,
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteService = (service: any) => {
    setDeletingService(service);
    setIsDeleteDialogOpen(true);
  };

  const handleFormSubmit = async (values: z.infer<typeof formSchema>) => {
    setSubmitting(true);
    
    try {
      const serviceData = {
        name: values.name,
        description: values.description || null,
        category: values.category || null,
        price_per_unit: parseFloat(values.price_per_unit),
        unit_type: values.unit_type,
        taxable: values.taxable,
      };

      if (editingService) {
        // Update existing service
        await updateService(editingService.id, serviceData);
        setIsEditModalOpen(false);
      } else {
        // Create new service
        await createService(serviceData);
        setIsCreateModalOpen(false);
      }
      
      form.reset();
      setEditingService(null);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingService) {
      await deleteService(deletingService.id);
      setIsDeleteDialogOpen(false);
      setDeletingService(null);
    }
  };

  // Price Pro functionality
  const handlePricePro = () => {
    // Check if business address is configured
    if (!settings?.business_address || !settings.business_address.city || !settings.business_address.state) {
      toast.error("Business address is required for Price Pro analysis. Please configure your business address in Settings first.");
      return;
    }

    // Get current form values for context
    const serviceName = form.getValues("name");
    const serviceDescription = form.getValues("description");
    const category = form.getValues("category");
    const unitType = form.getValues("unit_type");

    if (!serviceName || !unitType) {
      toast.error("Please enter service name and unit type before using Price Pro.");
      return;
    }

    setIsPriceProOpen(true);
  };

  const applyPrice = (price: number) => {
    form.setValue("price_per_unit", price.toString());
    setIsPriceProOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <main className="ml-64 p-8">
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading services...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="lg:ml-64 p-8">
        {/* Header section with title and create button */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Services</h1>
            <p className="text-muted-foreground">Manage your service offerings and pricing</p>
          </div>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleCreateService} size="lg" className="shadow-material-md">
                <Plus className="mr-2 h-5 w-5" />
                New Service
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New Service</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Plumbing Repair" {...field} />
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
                          <Textarea 
                            placeholder="Brief description of the service..."
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Plumbing, Electrical, HVAC" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="price_per_unit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price per Unit</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="unit_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit Type</FormLabel>
                          <FormControl>
                            <Input placeholder="hour, item, sq ft" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="taxable"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Taxable
                          </FormLabel>
                          <FormDescription>
                            Apply sales tax to this service when added to quotes and invoices
                          </FormDescription>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-2 pt-4">
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={handlePricePro}
                      className="flex-1"
                      disabled={submitting}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Price Pro
                    </Button>
                    
                    <Button type="submit" className="flex-1" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        'Create Service'
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and filter section */}
        <Card className="mb-6 shadow-material-md">
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search services..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline">
                Filter
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Services grid display */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServices.map((service) => (
            <Card key={service.id} className="group hover:shadow-material-lg transition-shadow duration-normal">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold text-foreground mb-2">
                      {service.name}
                    </CardTitle>
                    {service.category && (
                      <Badge variant="secondary" className="mb-3">
                        {service.category}
                      </Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditService(service)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Service
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteService(service)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Service
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {service.description}
                </p>
                <div className="flex justify-between items-center">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">${service.price_per_unit}</p>
                    <p className="text-sm text-muted-foreground">per {service.unit_type}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty state when no services match the search */}
        {filteredServices.length === 0 && !loading && (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? "No services found matching your search." : "No services available."}
              </p>
              {!searchTerm && (
                <Button onClick={handleCreateService}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Service
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Edit Service Modal */}
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Service</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Plumbing Repair" {...field} />
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
                        <Textarea 
                          placeholder="Brief description of the service..."
                          className="min-h-[80px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Plumbing, Electrical, HVAC" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price_per_unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price per Unit</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="unit_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit Type</FormLabel>
                        <FormControl>
                          <Input placeholder="hour, item, sq ft" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="taxable"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>
                          Taxable
                        </FormLabel>
                        <FormDescription>
                          Apply sales tax to this service when added to quotes and invoices
                        </FormDescription>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 pt-4">
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={handlePricePro}
                    className="flex-1"
                    disabled={submitting}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Price Pro
                  </Button>
                  
                  <Button type="submit" className="flex-1" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Service'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Service</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deletingService?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Price Pro Modal */}
        <PriceProModal
          isOpen={isPriceProOpen}
          onOpenChange={setIsPriceProOpen}
          serviceData={{
            name: form.getValues("name"),
            description: form.getValues("description"),
            category: form.getValues("category"),
            unitType: form.getValues("unit_type"),
          }}
          businessAddress={settings?.business_address}
          onApplyPrice={applyPrice}
        />
      </main>
    </div>
  );
}