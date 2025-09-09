import { useState } from "react";
import { Plus, Search, Filter, Eye, Edit, Trash2, MapPin, Phone, Mail } from "lucide-react";
import Navigation from "@/components/Layout/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const customers = [
  {
    id: "CUST-001",
    name: "Sarah Johnson",
    email: "sarah.johnson@email.com",
    phone: "(555) 123-4567",
    address: "123 Oak Street, Springfield, IL 62701",
    jobsCount: 3,
    totalValue: "$1,250.00",
    lastJob: "2024-01-15",
    status: "Active"
  },
  {
    id: "CUST-002", 
    name: "David Chen",
    email: "david.chen@email.com",
    phone: "(555) 234-5678",
    address: "456 Pine Avenue, Springfield, IL 62702",
    jobsCount: 1,
    totalValue: "$280.00", 
    lastJob: "2024-01-16",
    status: "Active"
  },
  {
    id: "CUST-003",
    name: "Emma Rodriguez",
    email: "emma.rodriguez@email.com", 
    phone: "(555) 345-6789",
    address: "789 Maple Drive, Springfield, IL 62703",
    jobsCount: 2,
    totalValue: "$890.00",
    lastJob: "2024-01-14", 
    status: "Active"
  }
];

export default function Customers() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="lg:ml-64">
        <div className="p-6 lg:p-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Customers</h1>
              <p className="text-muted-foreground">Manage your customer relationships and contact information</p>
            </div>
            <Button className="mt-4 sm:mt-0 shadow-material-sm hover:shadow-material-md transition-shadow duration-fast">
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          </div>

          {/* Filters */}
          <Card className="mb-6 shadow-material-md">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customers by name, email, or phone..."
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

          {/* Customer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {customers.map((customer) => (
              <Card key={customer.id} className="shadow-material-md hover:shadow-material-lg transition-shadow duration-normal">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{customer.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">
                        {customer.id}
                      </Badge>
                    </div>
                    <Badge className="bg-success text-success-foreground">
                      {customer.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Contact Information */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{customer.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{customer.phone}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span className="text-muted-foreground">{customer.address}</span>
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Jobs</p>
                      <p className="text-lg font-semibold text-foreground">{customer.jobsCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="text-lg font-semibold text-foreground">{customer.totalValue}</p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground">
                      Last job: <span className="font-medium">{customer.lastJob}</span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}