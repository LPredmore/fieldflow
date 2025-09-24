import { 
  Receipt, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  Share2,
  Send,
  CheckCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Invoice } from "@/hooks/useInvoices";
import { format } from "date-fns";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInUserTimezone } from "@/lib/timezoneUtils";

interface InvoiceCardProps {
  invoice: Invoice;
  isOverdue: boolean;
  onEdit: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  onPreview: (invoice: Invoice) => void;
  onShare: (invoiceId: string) => void;
  onSendEmail: (invoiceId: string, customerName: string) => void;
  onMarkAsPaid: (invoice: Invoice) => void;
}

export function InvoiceCard({ 
  invoice, 
  isOverdue, 
  onEdit, 
  onDelete, 
  onPreview, 
  onShare,
  onSendEmail, 
  onMarkAsPaid 
}: InvoiceCardProps) {
  const userTimezone = useUserTimezone();
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusInfo = () => {
    if (isOverdue) {
      return {
        label: 'Overdue',
        icon: AlertTriangle,
        className: 'bg-destructive/10 text-destructive border-destructive/20'
      };
    }
    
    switch (invoice.status) {
      case 'draft':
        return {
          label: 'Draft',
          icon: Receipt,
          className: 'bg-muted text-muted-foreground border-muted'
        };
      case 'sent':
        return {
          label: 'Sent',
          icon: Clock,
          className: 'bg-primary/10 text-primary border-primary/20'
        };
      case 'paid':
        return {
          label: 'Paid',
          icon: CheckCircle,
          className: 'bg-success/10 text-success border-success/20'
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          icon: XCircle,
          className: 'bg-warning/10 text-warning border-warning/20'
        };
      default:
        return {
          label: 'Unknown',
          icon: Receipt,
          className: 'bg-muted text-muted-foreground border-muted'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const canMarkAsPaid = invoice.status === 'sent' || isOverdue;
  const canShare = invoice.status === 'draft' || invoice.status === 'sent';

  return (
    <Card className="shadow-material-md hover:shadow-material-lg transition-shadow duration-normal">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{invoice.invoice_number}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{invoice.customer_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={statusInfo.className}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusInfo.label}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onPreview(invoice)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(invoice)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                {canShare && (
                  <>
                    <DropdownMenuItem onClick={() => onShare(invoice.id)}>
                      <Share2 className="h-4 w-4 mr-2" />
                      Copy Share Link
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onSendEmail(invoice.id, invoice.customer_name)}>
                      <Send className="h-4 w-4 mr-2" />
                      Send to Customer
                    </DropdownMenuItem>
                  </>
                )}
                {canMarkAsPaid && (
                  <DropdownMenuItem onClick={() => onMarkAsPaid(invoice)}>
                    <CheckCheck className="h-4 w-4 mr-2" />
                    Mark as Paid
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={() => onDelete(invoice)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Issue Date</p>
            <p className="font-medium">{format(new Date(invoice.issue_date), 'MMM dd, yyyy')}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Due Date</p>
            <p className={`font-medium ${isOverdue ? 'text-destructive' : ''}`}>
              {format(new Date(invoice.due_date), 'MMM dd, yyyy')}
            </p>
          </div>
        </div>

        {/* Amount */}
        <div className="pt-4 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Amount</span>
            <span className="text-xl font-bold">{formatCurrency(invoice.total_amount)}</span>
          </div>
        </div>

        {/* Payment Terms */}
        <div className="text-xs text-muted-foreground">
          Terms: {invoice.payment_terms}
        </div>
      </CardContent>
    </Card>
  );
}