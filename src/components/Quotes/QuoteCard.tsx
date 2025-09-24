import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Eye, 
  Share, 
  Mail,
  Briefcase,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInUserTimezone } from "@/lib/timezoneUtils";
import { canSendQuotes } from "@/utils/permissionUtils";

interface Quote {
  id: string;
  quote_number: string;
  customer_name: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  total_amount: number;
  valid_until?: string;
  created_at: string;
  notes?: string;
}

interface QuoteCardProps {
  quote: Quote;
  isExpired: boolean;
  onEdit: (quote: Quote) => void;
  onDelete: (id: string) => void;
  onPreview: (quote: Quote) => void;
  onShare: (id: string) => void;
  onSendEmail: (quote: Quote) => void;
  onConvertToJob: (id: string) => void;
}

export function QuoteCard({ 
  quote, 
  isExpired,
  onEdit, 
  onDelete, 
  onPreview, 
  onShare, 
  onSendEmail,
  onConvertToJob 
}: QuoteCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const { permissions } = usePermissions();
  const userTimezone = useUserTimezone();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getStatusInfo = (status: string) => {
    const effectiveStatus = isExpired ? 'expired' : status;
    
    const statusConfig = {
      draft: { label: "Draft", icon: FileText, className: "bg-gray-100 text-gray-800" },
      sent: { label: "Sent", icon: Clock, className: "bg-blue-100 text-blue-800" },
      accepted: { label: "Accepted", icon: CheckCircle, className: "bg-green-100 text-green-800" },
      declined: { label: "Declined", icon: XCircle, className: "bg-red-100 text-red-800" },
      expired: { label: "Expired", icon: AlertTriangle, className: "bg-orange-100 text-orange-800" },
    };

    return statusConfig[effectiveStatus as keyof typeof statusConfig] || statusConfig.draft;
  };

  const statusInfo = getStatusInfo(quote.status);
  const StatusIcon = statusInfo.icon;

  const handleDelete = () => {
    onDelete(quote.id);
    setShowDeleteDialog(false);
  };

  const handleConvertToJob = () => {
    onConvertToJob(quote.id);
    setShowConvertDialog(false);
  };

  const canShare = (quote.status === 'draft' || quote.status === 'sent') && canSendQuotes(permissions);
  const canConvert = quote.status === 'accepted' || quote.status === 'sent';

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-semibold text-lg truncate">{quote.title}</h3>
              <p className="text-sm text-muted-foreground">{quote.quote_number}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background">
                <DropdownMenuItem onClick={() => onPreview(quote)}>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(quote)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {canShare && (
                  <>
                    <DropdownMenuItem onClick={() => onSendEmail(quote)}>
                      <Mail className="mr-2 h-4 w-4" />
                      Send to Customer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onShare(quote.id)}>
                      <Share className="mr-2 h-4 w-4" />
                      Copy Share Link
                    </DropdownMenuItem>
                  </>
                )}
                {canConvert && (
                  <DropdownMenuItem onClick={() => setShowConvertDialog(true)}>
                    <Briefcase className="mr-2 h-4 w-4" />
                    Convert to Job
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Customer</span>
              <span className="text-sm font-medium">{quote.customer_name}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={statusInfo.className}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {statusInfo.label}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="text-sm font-semibold">{formatCurrency(quote.total_amount)}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm">{formatInUserTimezone(quote.created_at, userTimezone, "MMM dd, yyyy")}</span>
            </div>

            {quote.valid_until && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valid Until</span>
                <span className="text-sm">{format(new Date(quote.valid_until), "MMM dd, yyyy")}</span>
              </div>
            )}

            {quote.notes && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground truncate">{quote.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete quote "{quote.quote_number} - {quote.title}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete Quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert to Job Confirmation Dialog */}
      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to convert quote "{quote.quote_number} - {quote.title}" to a job? 
              This will create a new job record and mark the quote as accepted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvertToJob}>
              Convert to Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}