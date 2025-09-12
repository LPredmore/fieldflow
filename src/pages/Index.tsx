import { 
  Briefcase, 
  Users, 
  DollarSign, 
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle
} from "lucide-react";
import Navigation from "@/components/Layout/Navigation";
import RoleIndicator from "@/components/Layout/RoleIndicator";
import MetricCard from "@/components/Dashboard/MetricCard";
import RecentJobs from "@/components/Dashboard/RecentJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCustomers } from "@/hooks/useCustomers";
import { useJobs } from "@/hooks/useJobs";
import { useInvoices } from "@/hooks/useInvoices";
import { useQuotes } from "@/hooks/useQuotes";
import { QuoteForm } from "@/components/Quotes/QuoteForm";
import { CustomerForm } from "@/components/Customers/CustomerForm";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const Index = () => {
  const { stats: customerStats, createCustomer } = useCustomers();
  const { jobs } = useJobs();
  const { stats: invoiceStats } = useInvoices();
  const { stats: quoteStats, createQuote } = useQuotes();

  // Modal state
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  // Calculate dashboard metrics from real data
  const dashboardMetrics = useMemo(() => {
    const activeJobs = jobs.filter(job => 
      job.status === 'scheduled' || job.status === 'in_progress'
    ).length;
    
    const urgentJobs = jobs.filter(job => 
      job.priority === 'urgent' || job.priority === 'high'
    ).length;
    
    const todaysJobs = jobs.filter(job => {
      const today = new Date().toDateString();
      const jobDate = new Date(job.scheduled_date).toDateString();
      return jobDate === today;
    }).length;

    // Calculate completion rate for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentJobs = jobs.filter(job => 
      new Date(job.scheduled_date) >= thirtyDaysAgo
    );
    
    const completedRecentJobs = recentJobs.filter(job => 
      job.status === 'completed'
    ).length;
    
    const completionRate = recentJobs.length > 0 
      ? Math.round((completedRecentJobs / recentJobs.length) * 100)
      : 0;

    return {
      activeJobs,
      urgentJobs,
      todaysJobs,
      completionRate,
      totalCustomers: customerStats.total,
      monthlyRevenue: invoiceStats.paid_last_30_days,
      pendingPayments: invoiceStats.outstanding,
    };
  }, [jobs, customerStats, invoiceStats]);

  // Get today's scheduled jobs
  const todaysSchedule = useMemo(() => {
    const today = new Date().toDateString();
    return jobs
      .filter(job => {
        const jobDate = new Date(job.scheduled_date).toDateString();
        return jobDate === today;
      })
      .slice(0, 3); // Show up to 3 jobs
  }, [jobs]);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Main Content */}
      <div className="lg:ml-64">
        <div className="p-6 lg:p-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
                <p className="text-muted-foreground">Welcome back! Here's what's happening with your field operations.</p>
              </div>
              <RoleIndicator />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <div className="flex flex-wrap gap-4">
              <Button 
                onClick={() => setIsQuoteModalOpen(true)}
                className="shadow-material-sm hover:shadow-material-md transition-shadow duration-fast"
              >
                <Briefcase className="h-4 w-4 mr-2" />
                New Job
              </Button>
              <Button 
                onClick={() => setIsCustomerModalOpen(true)}
                variant="outline" 
                className="shadow-material-sm hover:shadow-material-md transition-shadow duration-fast"
              >
                <Users className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
              <Button 
                variant="outline" 
                className="shadow-material-sm hover:shadow-material-md transition-shadow duration-fast"
                onClick={() => window.location.href = '/calendar'}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Active Jobs"
              value={dashboardMetrics.activeJobs}
              subtitle={`${dashboardMetrics.urgentJobs} urgent, ${dashboardMetrics.todaysJobs} scheduled today`}
              icon={Briefcase}
            />
            <MetricCard
              title="Total Customers"
              value={dashboardMetrics.totalCustomers}
              subtitle={customerStats.residential > 0 || customerStats.commercial > 0 
                ? `${customerStats.residential} residential, ${customerStats.commercial} commercial`
                : "No customers yet"
              }
              icon={Users}
            />
            <MetricCard
              title="Monthly Revenue"
              value={`$${dashboardMetrics.monthlyRevenue.toLocaleString()}`}
              subtitle={`$${dashboardMetrics.pendingPayments.toLocaleString()} pending payments`}
              icon={DollarSign}
            />
            <MetricCard
              title="Completion Rate"
              value={`${dashboardMetrics.completionRate}%`}
              subtitle="Jobs completed on time (last 30 days)"
              icon={TrendingUp}
            />
          </div>

          {/* Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Recent Jobs - Takes up 2 columns */}
            <div className="xl:col-span-2">
              <RecentJobs />
            </div>

            {/* Today's Schedule */}
            <Card className="shadow-material-md">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold">Today's Schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {todaysSchedule.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No jobs scheduled for today</p>
                    <p className="text-sm">Schedule some jobs to see them here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todaysSchedule.map((job) => {
                      const getJobStatusColor = (status: string) => {
                        switch (status) {
                          case 'completed':
                            return 'bg-success';
                          case 'in_progress':
                            return 'bg-warning';
                          case 'scheduled':
                            return 'bg-primary';
                          default:
                            return 'bg-muted';
                        }
                      };

                      const getJobStatusIcon = (status: string) => {
                        switch (status) {
                          case 'completed':
                            return CheckCircle;
                          case 'in_progress':
                            return Clock;
                          case 'scheduled':
                            return Calendar;
                          default:
                            return AlertTriangle;
                        }
                      };

                      const StatusIcon = getJobStatusIcon(job.status);

                      return (
                        <div key={job.id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                          <div className={`h-2 w-2 rounded-full ${getJobStatusColor(job.status)}`}></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{job.customer_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.scheduled_time || 'All day'} - {job.title}
                            </p>
                          </div>
                          <StatusIcon className={`h-4 w-4 ${
                            job.status === 'completed' ? 'text-success' : 
                            job.status === 'in_progress' ? 'text-warning' : 
                            'text-primary'
                          }`} />
                        </div>
                      );
                    })}
                  </div>
                )}
                
                <Button 
                  variant="outline" 
                  className="w-full mt-4"
                  onClick={() => window.location.href = '/calendar'}
                >
                  View Full Calendar
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      <QuoteForm
        open={isQuoteModalOpen}
        onOpenChange={setIsQuoteModalOpen}
        onSubmit={async (data) => {
          try {
            await createQuote(data as any);
            toast.success("Quote created successfully");
          } catch (error) {
            toast.error("Failed to create quote");
          }
        }}
        title="Create New Quote"
      />

      <CustomerForm
        open={isCustomerModalOpen}
        onOpenChange={setIsCustomerModalOpen}
        onSubmit={async (data) => {
          try {
            await createCustomer(data);
            toast.success("Customer added successfully");
          } catch (error) {
            toast.error("Failed to add customer");
          }
        }}
        title="Add New Customer"
      />
    </div>
  );
};

export default Index;