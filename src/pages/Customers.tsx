import { useState, useMemo } from "react";
import { Plus, Search, Filter, Eye, Edit, Trash2, MapPin, Phone, Mail, Home, Building2, MoreVertical, Users } from "lucide-react";
import Navigation from "@/components/Layout/Navigation";
import RoleIndicator from "@/components/Layout/RoleIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCustomers, Customer, CustomerFormData } from "@/hooks/useCustomers";
import { CustomerForm } from "@/components/Customers/CustomerForm";
import { CustomerStatsCards } from "@/components/Customers/CustomerStatsCards";

export default function Customers() {
  const { customers, loading, stats, createCustomer, updateCustomer, deleteCustomer } = useCustomers();
  const [searchTerm, setSearchTerm] = useState("");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'all' | 'residential' | 'commercial'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  // Filter and search customers
  const filteredCustomers = useMemo(() => {
    let filtered = customers;

    // Filter by type
    if (customerTypeFilter !== 'all') {
      filtered = filtered.filter(customer => customer.customer_type === customerTypeFilter);
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(customer =>
        customer.name.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower) ||
        customer.phone.toLowerCase().includes(searchLower) ||
        customer.address?.city?.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [customers, customerTypeFilter, searchTerm]);

  const handleCreateCustomer = async (data: CustomerFormData) => {
    await createCustomer(data);
  };

  const handleEditCustomer = async (data: CustomerFormData) => {
    if (editingCustomer) {
      await updateCustomer(editingCustomer.id, data);
      setEditingCustomer(null);
    }
  };

  const handleDeleteCustomer = async () => {
    if (deletingCustomer) {
      await deleteCustomer(deletingCustomer.id);
      setDeletingCustomer(null);
    }
  };

  const formatAddress = (address: Customer['address']) => {
    if (!address) return 'No address provided';
    const parts = [address.street, address.city, address.state, address.zip_code].filter(Boolean);
    return parts.join(', ') || 'No address provided';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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
                <h1 className="text-3xl font-bold text-foreground mb-2">Customers</h1>
                <p className="text-muted-foreground">Manage your customer relationships and contact information</p>
              </div>
              <RoleIndicator />
            </div>
            <Button 
              onClick={() => setIsFormOpen(true)}
              className="mt-4 sm:mt-0 shadow-material-sm hover:shadow-material-md transition-shadow duration-fast"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>

          {/* Statistics Cards */}
          <CustomerStatsCards stats={stats} />

          {/* Filter Tabs */}
          <Card className="mb-6 shadow-material-md">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customers by name, email, phone, or city..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={customerTypeFilter === 'all' ? 'default' : 'outline'}
                    onClick={() => setCustomerTypeFilter('all')}
                    size="sm"
                  >
                    All ({stats.total})
                  </Button>
                  <Button
                    variant={customerTypeFilter === 'residential' ? 'default' : 'outline'}
                    onClick={() => setCustomerTypeFilter('residential')}
                    size="sm"
                  >
                    <Home className="h-4 w-4 mr-1" />
                    Residential ({stats.residential})
                  </Button>
                  <Button
                    variant={customerTypeFilter === 'commercial' ? 'default' : 'outline'}
                    onClick={() => setCustomerTypeFilter('commercial')}
                    size="sm"
                  >
                    <Building2 className="h-4 w-4 mr-1" />
                    Commercial ({stats.commercial})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="shadow-material-md">
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredCustomers.length === 0 && (
            <Card className="shadow-material-md">
              <CardContent className="p-12 text-center">
                <div className="mb-4">
                  <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm || customerTypeFilter !== 'all' ? 'No customers found' : 'No customers yet'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || customerTypeFilter !== 'all' 
                    ? 'Try adjusting your search or filters to find what you\'re looking for.'
                    : 'Get started by adding your first customer to the system.'
                  }
                </p>
                {!searchTerm && customerTypeFilter === 'all' && (
                  <Button onClick={() => setIsFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Customer
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Customer Grid */}
          {!loading && filteredCustomers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredCustomers.map((customer) => (
                <Card key={customer.id} className="shadow-material-md hover:shadow-material-lg transition-shadow duration-normal">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{customer.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {customer.customer_type === 'residential' ? (
                              <><Home className="h-3 w-3 mr-1" />Residential</>
                            ) : (
                              <><Building2 className="h-3 w-3 mr-1" />Commercial</>
                            )}
                          </Badge>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingCustomer(customer)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeletingCustomer(customer)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Contact Information */}
                    <div className="space-y-2">
                      {customer.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">{customer.email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{customer.phone}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span className="text-muted-foreground">{formatAddress(customer.address)}</span>
                      </div>
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Jobs</p>
                        <p className="text-lg font-semibold text-foreground">{customer.total_jobs_count}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Revenue</p>
                        <p className="text-lg font-semibold text-foreground">{formatCurrency(customer.total_revenue_billed)}</p>
                      </div>
                    </div>

                    {customer.notes && (
                      <div className="pt-2">
                        <p className="text-xs text-muted-foreground">
                          Notes: <span className="font-medium">{customer.notes}</span>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Customer Form Modal */}
          <CustomerForm
            open={isFormOpen}
            onOpenChange={setIsFormOpen}
            onSubmit={handleCreateCustomer}
            title="Add New Customer"
          />

          {/* Edit Customer Form Modal */}
          <CustomerForm
            open={!!editingCustomer}
            onOpenChange={(open) => !open && setEditingCustomer(null)}
            onSubmit={handleEditCustomer}
            customer={editingCustomer}
            title="Edit Customer"
          />

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={!!deletingCustomer} onOpenChange={(open) => !open && setDeletingCustomer(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Customer</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{deletingCustomer?.name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteCustomer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}