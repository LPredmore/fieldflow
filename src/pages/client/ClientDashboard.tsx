import { useClientCustomer } from '@/hooks/useClientCustomer';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  User, 
  FileText, 
  Receipt, 
  Phone, 
  Mail, 
  MapPin,
  ArrowRight,
  Building
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ClientDashboard() {
  const { customer, loading, error } = useClientCustomer();
  const { user } = useAuth();
  const { settings } = useSettings();

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <User className="h-12 w-12 text-muted-foreground" />
            </div>
            <CardTitle>Profile Not Found</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact{' '}
              {settings?.business_name || 'your service provider'}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Welcome back, {customer?.name?.split(' ')[0] || 'Client'}!
        </h1>
        <p className="text-muted-foreground">
          Manage your account and view your service history with{' '}
          {settings?.business_name || 'us'}.
        </p>
      </div>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Profile Summary */}
        <Card className="shadow-material-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">My Profile</CardTitle>
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{customer?.email || user?.email || 'No email'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{customer?.phone || 'No phone'}</span>
            </div>
            {customer?.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>
                  {customer.address.street && `${customer.address.street}, `}
                  {customer.address.city && `${customer.address.city}, `}
                  {customer.address.state} {customer.address.zip}
                </span>
              </div>
            )}
            <Button asChild variant="outline" size="sm" className="w-full mt-4">
              <Link to="/client/profile">
                Edit Profile
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Quotes Card */}
        <Card className="shadow-material-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">My Quotes</CardTitle>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardDescription>View and respond to quotes</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Access quotes sent to you and respond directly.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/client/quotes">
                View Quotes
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Invoices Card */}
        <Card className="shadow-material-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">My Invoices</CardTitle>
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </div>
            <CardDescription>View and pay invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              View your invoices and payment history.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/client/invoices">
                View Invoices
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Business Contact Info */}
      <Card className="shadow-material-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>{settings?.business_name || 'Contact Us'}</CardTitle>
              <CardDescription>Need help? Get in touch with us.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settings?.business_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{settings.business_phone}</span>
              </div>
            )}
            {settings?.business_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a 
                  href={`mailto:${settings.business_email}`}
                  className="text-primary hover:underline"
                >
                  {settings.business_email}
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
