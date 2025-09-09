import { Users, Home, Building2, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface CustomerStatsCardsProps {
  stats: {
    total: number;
    residential: number;
    commercial: number;
    totalRevenue: number;
  };
}

export function CustomerStatsCards({ stats }: CustomerStatsCardsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const statsData = [
    {
      title: "Total Customers",
      value: stats.total,
      icon: Users,
      description: "All customers",
    },
    {
      title: "Residential",
      value: stats.residential,
      icon: Home,
      description: "Residential customers",
    },
    {
      title: "Commercial",
      value: stats.commercial,
      icon: Building2,
      description: "Commercial customers",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: DollarSign,
      description: "Total billed revenue",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {statsData.map((stat) => {
        const IconComponent = stat.icon;
        return (
          <Card key={stat.title} className="shadow-material-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </p>
                  <p className="text-3xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                </div>
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <IconComponent className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}