import { useState } from "react";
import { Plus, Search, Filter, Eye, Edit, Trash2 } from "lucide-react";
import Navigation from "@/components/Layout/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const jobs = [
  {
    id: "JOB-2024-001",
    customer: "Sarah Johnson",
    service: "Plumbing Repair", 
    status: "In Progress",
    priority: "High",
    date: "2024-01-15",
    contractor: "Mike Wilson",
    value: "$350.00"
  },
  {
    id: "JOB-2024-002",
    customer: "David Chen", 
    service: "HVAC Maintenance",
    status: "Scheduled",
    priority: "Medium",
    date: "2024-01-16",
    contractor: "Lisa Martinez",
    value: "$280.00"
  },
  {
    id: "JOB-2024-003",
    customer: "Emma Rodriguez",
    service: "Electrical Installation",
    status: "Completed", 
    priority: "Low",
    date: "2024-01-14",
    contractor: "Tom Anderson", 
    value: "$520.00"
  }
];

const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'bg-success text-success-foreground';
    case 'in progress':
      return 'bg-warning text-warning-foreground';
    case 'scheduled':
      return 'bg-primary text-primary-foreground';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export default function Jobs() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="lg:ml-64">
        <div className="p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Jobs</h1>
              <p className="text-muted-foreground">Manage and track your field service jobs</p>
            </div>
            <Button className="mt-4 sm:mt-0 shadow-material-sm hover:shadow-material-md transition-shadow duration-fast">
              <Plus className="h-4 w-4 mr-2" />
              New Job
            </Button>
          </div>

          {/* Filters */}
          <Card className="mb-6 shadow-material-md">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search jobs, customers, or services..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" className="sm:w-auto">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Jobs Table */}
          <Card className="shadow-material-md">
            <CardHeader>
              <CardTitle>All Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Contractor</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.id}</TableCell>
                      <TableCell>{job.customer}</TableCell>
                      <TableCell>{job.service}</TableCell>
                      <TableCell>
                        <Badge className={`${getStatusColor(job.status)}`}>
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{job.date}</TableCell>
                      <TableCell>{job.contractor}</TableCell>
                      <TableCell className="font-medium">{job.value}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}