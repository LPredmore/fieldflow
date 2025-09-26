import { useState, useMemo } from "react";
import { Plus, Search, FileText } from "lucide-react";

import RoleIndicator from "@/components/Layout/RoleIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInvoices, Invoice, InvoiceFormData } from "@/hooks/useInvoices";
import { InvoiceStatsCards } from "@/components/Invoices/InvoiceStatsCards";
import { InvoiceCard } from "@/components/Invoices/InvoiceCard";
import { InvoiceForm } from "@/components/Invoices/InvoiceForm";
import { InvoicePreview } from "@/components/Invoices/InvoicePreview";
import { useToast } from "@/hooks/use-toast";

export default function Invoices() {
  const { 
    invoices, 
    loading, 
    stats, 
    isOverdue, 
    createInvoice, 
    updateInvoice, 
    deleteInvoice, 
    updateStatus,
    shareInvoice,
    sendInvoiceEmail,
    isSharing,
    isSending
  } = useInvoices();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  // Filter and search invoices
  const filteredInvoices = useMemo(() => {
    let filtered = invoices;

    // Filter by status
    if (statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        filtered = filtered.filter(invoice => isOverdue(invoice));
      } else {
        filtered = filtered.filter(invoice => invoice.status === statusFilter);
      }
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(invoice =>
        invoice.invoice_number.toLowerCase().includes(searchLower) ||
        invoice.customer_name.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [invoices, statusFilter, searchTerm, isOverdue]);

  const handleCreateInvoice = async (data: InvoiceFormData) => {
    await createInvoice(data);
  };

  const handleEditInvoice = async (data: InvoiceFormData) => {
    if (editingInvoice) {
      await updateInvoice({ id: editingInvoice.id, ...data });
      setEditingInvoice(null);
    }
  };

  const handleDeleteInvoice = async () => {
    if (deletingInvoice) {
      await deleteInvoice(deletingInvoice.id);
      setDeletingInvoice(null);
    }
  };

  const handleShareInvoice = async (invoiceId: string) => {
    try {
      await shareInvoice(invoiceId);
    } catch (error) {
      console.error("Error sharing invoice:", error);
    }
  };

  const handleSendInvoiceEmail = async (invoiceId: string, customerName: string, customerId: string) => {
    try {
      await sendInvoiceEmail(invoiceId, customerName, customerId);
    } catch (error) {
      console.error("Error sending invoice email:", error);
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice) => {
    try {
      await updateStatus({
        id: invoice.id,
        status: 'paid',
        additionalData: { paid_date: new Date().toISOString() }
      });
    } catch (error) {
      console.error("Error marking invoice as paid:", error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:ml-64">
        <div className="p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Invoices</h1>
                <p className="text-muted-foreground">Create and manage customer invoices</p>
              </div>
              <RoleIndicator />
            </div>
            <Button 
              onClick={() => setIsFormOpen(true)}
              className="mt-4 sm:mt-0 shadow-material-sm hover:shadow-material-md transition-shadow duration-fast"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Button>
          </div>

          {/* Statistics Cards */}
          <InvoiceStatsCards stats={stats} />

          {/* Search and Filter */}
          <Card className="mb-6 shadow-material-md">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search invoices by number or customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="shadow-material-md">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <div className="grid grid-cols-2 gap-4">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredInvoices.length === 0 && (
            <Card className="shadow-material-md">
              <CardContent className="p-12 text-center">
                <div className="mb-4">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm || statusFilter !== 'all' ? 'No invoices found' : 'No invoices yet'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filters to find what you\'re looking for.'
                    : 'Get started by creating your first invoice for a customer.'
                  }
                </p>
                {!searchTerm && statusFilter === 'all' && (
                  <Button onClick={() => setIsFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Invoice
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Invoice Grid */}
          {!loading && filteredInvoices.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredInvoices.map((invoice) => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  isOverdue={isOverdue(invoice)}
                  onEdit={setEditingInvoice}
                  onDelete={setDeletingInvoice}
                  onPreview={setPreviewInvoice}
                  onShare={handleShareInvoice}
                  onSendEmail={(invoiceId, customerName) => handleSendInvoiceEmail(invoiceId, customerName, invoice.customer_id)}
                  onMarkAsPaid={handleMarkAsPaid}
                />
              ))}
            </div>
          )}

          {/* Create Invoice Form Modal */}
          <InvoiceForm
            open={isFormOpen}
            onOpenChange={setIsFormOpen}
            onSubmit={handleCreateInvoice}
            title="Create New Invoice"
          />

          {/* Edit Invoice Form Modal */}
          <InvoiceForm
            open={!!editingInvoice}
            onOpenChange={(open) => !open && setEditingInvoice(null)}
            onSubmit={handleEditInvoice}
            invoice={editingInvoice}
            title="Edit Invoice"
          />

          {/* Invoice Preview Modal */}
          <InvoicePreview
            open={!!previewInvoice}
            onOpenChange={(open) => !open && setPreviewInvoice(null)}
            invoice={previewInvoice}
          />

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={!!deletingInvoice} onOpenChange={(open) => !open && setDeletingInvoice(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete invoice "{deletingInvoice?.invoice_number}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteInvoice} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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