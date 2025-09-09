import { useState } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "@/hooks/use-toast";
import Navigation from "@/components/Layout/Navigation";

interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  pricePerUnit: number;
  unitType: string;
}

const mockServices: Service[] = [
  {
    id: "1",
    name: "Standard Lawn Mowing",
    description: "Regular lawn mowing service including grass cutting, edging, and cleanup",
    category: "Lawn Care",
    pricePerUnit: 45.00,
    unitType: "per visit"
  },
  {
    id: "2",
    name: "Hedge Trimming",
    description: "Professional hedge and shrub trimming service",
    category: "Landscaping",
    pricePerUnit: 65.00,
    unitType: "per hour"
  },
  {
    id: "3",
    name: "Garden Cleanup",
    description: "Comprehensive garden cleanup including weeding and debris removal",
    category: "Maintenance",
    pricePerUnit: 75.00,
    unitType: "per hour"
  }
];

export default function Services() {
  const [services, setServices] = useState<Service[]>(mockServices);
  const [searchTerm, setSearchTerm] = useState("");
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false);
  const [isPriceSuggestionOpen, setIsPriceSuggestionOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    pricePerUnit: "",
    unitType: ""
  });

  const [priceSuggestionContext, setPriceSuggestionContext] = useState("");
  const [suggestedPrices, setSuggestedPrices] = useState<{
    low: number;
    average: number;
    high: number;
    reasoning: string;
  } | null>(null);

  const filteredServices = services.filter(service =>
    service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    service.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateService = () => {
    setEditingService(null);
    setFormData({
      name: "",
      description: "",
      category: "",
      pricePerUnit: "",
      unitType: ""
    });
    setIsServiceFormOpen(true);
  };

  const handleEditService = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description,
      category: service.category,
      pricePerUnit: service.pricePerUnit.toString(),
      unitType: service.unitType
    });
    setIsServiceFormOpen(true);
  };

  const handleDeleteService = (service: Service) => {
    setServiceToDelete(service);
    setIsDeleteDialogOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.pricePerUnit || !formData.unitType) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive"
      });
      return;
    }

    const serviceData = {
      ...formData,
      pricePerUnit: parseFloat(formData.pricePerUnit)
    };

    if (editingService) {
      setServices(prev => prev.map(service => 
        service.id === editingService.id 
          ? { ...service, ...serviceData }
          : service
      ));
      toast({
        title: "Service Updated",
        description: "Your service has been updated successfully."
      });
    } else {
      const newService: Service = {
        id: Date.now().toString(),
        ...serviceData
      };
      setServices(prev => [...prev, newService]);
      toast({
        title: "Service Created",
        description: "Your new service has been created successfully."
      });
    }

    setIsServiceFormOpen(false);
  };

  const confirmDelete = () => {
    if (serviceToDelete) {
      setServices(prev => prev.filter(service => service.id !== serviceToDelete.id));
      toast({
        title: "Service Deleted",
        description: "The service has been removed from your catalog."
      });
      setIsDeleteDialogOpen(false);
      setServiceToDelete(null);
    }
  };

  const handlePriceSuggestion = async () => {
    setIsLoadingSuggestion(true);
    
    // Mock AI suggestion - in real implementation, this would call an AI service
    setTimeout(() => {
      setSuggestedPrices({
        low: 35.00,
        average: 50.00,
        high: 75.00,
        reasoning: `Based on market analysis for "${formData.name}" services in your area, considering factors like labor costs, equipment usage, and competitive pricing.`
      });
      setIsLoadingSuggestion(false);
    }, 2000);
  };

  const applyPrice = (price: number) => {
    setFormData(prev => ({ ...prev, pricePerUnit: price.toString() }));
    setIsPriceSuggestionOpen(false);
    setSuggestedPrices(null);
  };

  return (
    <div className="min-h-screen bg-surface">
      <Navigation />
      
      <div className="ml-0 lg:ml-64 min-h-screen">
        <div className="container mx-auto p-6 pt-20 lg:pt-6">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground">Services</h1>
                <p className="text-muted-foreground mt-1">
                  Manage your service catalog and pricing
                </p>
              </div>
              <Button onClick={handleCreateService} className="shadow-material-sm">
                <Plus className="h-4 w-4 mr-2" />
                New Service
              </Button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search services..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Services Grid */}
          {filteredServices.length === 0 && searchTerm ? (
            <Card className="shadow-material-md">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No services found matching "{searchTerm}"</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your search term</p>
              </CardContent>
            </Card>
          ) : filteredServices.length === 0 ? (
            <Card className="shadow-material-md">
              <CardContent className="py-12 text-center">
                <h3 className="text-lg font-semibold text-foreground mb-2">No services defined yet</h3>
                <p className="text-muted-foreground mb-4">
                  Start building your service catalog to streamline quote and invoice creation
                </p>
                <Button onClick={handleCreateService}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Service
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredServices.map((service) => (
                <Card key={service.id} className="shadow-material-md hover:shadow-material-lg transition-shadow duration-fast">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{service.name}</CardTitle>
                        {service.category && (
                          <Badge variant="secondary" className="mt-2">
                            {service.category}
                          </Badge>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditService(service)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteService(service)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                      {service.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold text-primary">
                          ${service.pricePerUnit.toFixed(2)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {service.unitType}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Service Form Modal */}
      <Dialog open={isServiceFormOpen} onOpenChange={setIsServiceFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingService ? "Edit Service" : "Create New Service"}
            </DialogTitle>
            <DialogDescription>
              {editingService 
                ? "Update the details of your service" 
                : "Add a new service to your catalog"
              }
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Standard Lawn Mowing"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this service includes..."
                rows={3}
              />
            </div>
            
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., Lawn Care, Landscaping"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Price per Unit *</Label>
                <div className="flex gap-2">
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pricePerUnit}
                    onChange={(e) => setFormData(prev => ({ ...prev, pricePerUnit: e.target.value }))}
                    placeholder="0.00"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPriceSuggestionOpen(true)}
                    className="px-3"
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <Label htmlFor="unitType">Unit Type *</Label>
                <Input
                  id="unitType"
                  value={formData.unitType}
                  onChange={(e) => setFormData(prev => ({ ...prev, unitType: e.target.value }))}
                  placeholder="e.g., per hour, per visit"
                  required
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsServiceFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingService ? "Update Service" : "Create Service"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Price Suggestion Modal */}
      <Dialog open={isPriceSuggestionOpen} onOpenChange={setIsPriceSuggestionOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>AI Price Suggestion</DialogTitle>
            <DialogDescription>
              Get AI-powered pricing recommendations for "{formData.name}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="context">Additional Context (Optional)</Label>
              <Textarea
                id="context"
                value={priceSuggestionContext}
                onChange={(e) => setPriceSuggestionContext(e.target.value)}
                placeholder="e.g., high-end residential clients, includes specific materials..."
                rows={3}
              />
            </div>
            
            {!suggestedPrices && (
              <Button 
                onClick={handlePriceSuggestion} 
                disabled={isLoadingSuggestion}
                className="w-full"
              >
                {isLoadingSuggestion ? "Getting Suggestion..." : "Get Suggestion"}
              </Button>
            )}
            
            {suggestedPrices && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">AI Reasoning</h4>
                  <p className="text-sm text-muted-foreground">
                    {suggestedPrices.reasoning}
                  </p>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-sm text-muted-foreground">Low</p>
                    <p className="text-lg font-bold">${suggestedPrices.low.toFixed(2)}</p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => applyPrice(suggestedPrices.low)}
                      className="mt-2"
                    >
                      Use this price
                    </Button>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg border-primary bg-primary/5">
                    <p className="text-sm text-muted-foreground">Average</p>
                    <p className="text-lg font-bold text-primary">${suggestedPrices.average.toFixed(2)}</p>
                    <Button 
                      size="sm" 
                      onClick={() => applyPrice(suggestedPrices.average)}
                      className="mt-2"
                    >
                      Use this price
                    </Button>
                  </div>
                  
                  <div className="text-center p-3 border rounded-lg">
                    <p className="text-sm text-muted-foreground">High</p>
                    <p className="text-lg font-bold">${suggestedPrices.high.toFixed(2)}</p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => applyPrice(suggestedPrices.high)}
                      className="mt-2"
                    >
                      Use this price
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setIsPriceSuggestionOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{serviceToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete Service
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}