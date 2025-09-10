import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import Navigation from "@/components/Layout/Navigation";
import RoleIndicator from "@/components/Layout/RoleIndicator";
import { QuoteStatsCards } from "@/components/Quotes/QuoteStatsCards";
import { QuoteCard } from "@/components/Quotes/QuoteCard";
import { QuoteForm } from "@/components/Quotes/QuoteForm";
import { QuotePreview } from "@/components/Quotes/QuotePreview";
import { useQuotes } from "@/hooks/useQuotes";

interface Quote {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  title: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  valid_until?: string;
  line_items: any[];
  tax_rate: number;
  notes?: string;
  terms: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  updated_at?: string;
  tenant_id: string;
  created_by_user_id: string;
}

export default function Quotes() {
  const {
    quotes,
    loading,
    stats,
    isExpired,
    createQuote,
    updateQuote,
    deleteQuote,
    shareQuote,
    sendQuoteEmail,
    convertToJob,
  } = useQuotes();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [showQuotePreview, setShowQuotePreview] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");

  // Filter quotes based on search and status
  const filteredQuotes = quotes.filter((quote) => {
    const matchesSearch = 
      quote.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quote_number.toLowerCase().includes(searchTerm.toLowerCase());
    
    const effectiveStatus = isExpired(quote) ? 'expired' : quote.status;
    const matchesStatus = statusFilter === "all" || effectiveStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleCreateQuote = () => {
    setSelectedQuote(null);
    setFormMode("create");
    setShowQuoteForm(true);
  };

  const handleEditQuote = (quote: Quote) => {
    setSelectedQuote(quote);
    setFormMode("edit");
    setShowQuoteForm(true);
  };

  const handlePreviewQuote = (quote: Quote) => {
    setSelectedQuote(quote);
    setShowQuotePreview(true);
  };

  const handleSendQuoteEmail = (quote: Quote) => {
    sendQuoteEmail(quote.id, quote.customer_name, quote.customer_id);
  };

  const handleQuoteFormSubmit = (data: any) => {
    if (formMode === "create") {
      createQuote(data);
    } else if (selectedQuote) {
      updateQuote({ ...data, id: selectedQuote.id });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-sm text-muted-foreground">Loading quotes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
              <p className="text-muted-foreground">
                Create and manage service quotes for your customers
              </p>
            </div>
            <RoleIndicator />
          </div>
          <Button onClick={handleCreateQuote}>
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Button>
        </div>

        {/* Statistics */}
        <QuoteStatsCards stats={stats} />

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search quotes by title, customer, or number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quotes Grid */}
        {filteredQuotes.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredQuotes.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                isExpired={isExpired(quote)}
                onEdit={handleEditQuote}
                onDelete={deleteQuote}
                onPreview={handlePreviewQuote}
                onShare={shareQuote}
                onSendEmail={handleSendQuoteEmail}
                onConvertToJob={convertToJob}
              />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          // Empty state when no quotes exist
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No quotes found</h3>
            <p className="text-muted-foreground mb-4">
              Get started by creating your first quote for a customer.
            </p>
            <Button onClick={handleCreateQuote}>
              <Plus className="mr-2 h-4 w-4" />
              Create First Quote
            </Button>
          </div>
        ) : (
          // No results state when search/filter yields no results
          <div className="text-center py-12">
            <div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No quotes found</h3>
            <p className="text-muted-foreground mb-4">
              No quotes match your current search or filter criteria.
            </p>
            <Button variant="outline" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
              Clear Filters
            </Button>
          </div>
        )}

        {/* Quote Form Modal */}
        <QuoteForm
          open={showQuoteForm}
          onOpenChange={setShowQuoteForm}
          onSubmit={handleQuoteFormSubmit}
          quote={selectedQuote}
          title={formMode === "create" ? "Create New Quote" : "Edit Quote"}
        />

        {/* Quote Preview Modal */}
        <QuotePreview
          open={showQuotePreview}
          onOpenChange={setShowQuotePreview}
          quote={selectedQuote}
        />
      </main>
    </div>
  );
}