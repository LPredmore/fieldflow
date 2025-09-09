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
import MetricCard from "@/components/Dashboard/MetricCard";
import RecentJobs from "@/components/Dashboard/RecentJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Main Content */}
      <div className="lg:ml-64">
        <div className="p-6 lg:p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Welcome back! Here's what's happening with your field operations.</p>
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <div className="flex flex-wrap gap-4">
              <Button className="shadow-material-sm hover:shadow-material-md transition-shadow duration-fast">
                <Briefcase className="h-4 w-4 mr-2" />
                New Job
              </Button>
              <Button variant="outline" className="shadow-material-sm hover:shadow-material-md transition-shadow duration-fast">
                <Users className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
              <Button variant="outline" className="shadow-material-sm hover:shadow-material-md transition-shadow duration-fast">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <MetricCard
              title="Active Jobs"
              value={12}
              subtitle="2 urgent, 5 scheduled today"
              icon={Briefcase}
              trend={{ value: 8, isPositive: true }}
            />
            <MetricCard
              title="Total Customers"
              value={248}
              subtitle="15 new this month"
              icon={Users}
              trend={{ value: 12, isPositive: true }}
            />
            <MetricCard
              title="Monthly Revenue"
              value="$24,580"
              subtitle="$3,200 pending payments"
              icon={DollarSign}
              trend={{ value: 15, isPositive: true }}
            />
            <MetricCard
              title="Completion Rate"
              value="94%"
              subtitle="Jobs completed on time"
              icon={TrendingUp}
              trend={{ value: 3, isPositive: true }}
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
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
                    <div className="h-2 w-2 rounded-full bg-success"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Mike Wilson</p>
                      <p className="text-xs text-muted-foreground">2:00 PM - Johnson Residence</p>
                    </div>
                    <CheckCircle className="h-4 w-4 text-success" />
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10">
                    <div className="h-2 w-2 rounded-full bg-warning"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Lisa Martinez</p>
                      <p className="text-xs text-muted-foreground">9:00 AM - Chen Property</p>
                    </div>
                    <Clock className="h-4 w-4 text-warning" />
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10">
                    <div className="h-2 w-2 rounded-full bg-destructive"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Tom Anderson</p>
                      <p className="text-xs text-muted-foreground">11:30 AM - Rodriguez Home</p>
                    </div>
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  </div>
                </div>
                
                <Button variant="outline" className="w-full mt-4">
                  View Full Calendar
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;