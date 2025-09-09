import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Navigation from "@/components/Layout/Navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import BusinessSettings from "@/components/Settings/BusinessSettings";
import FinancialSettings from "@/components/Settings/FinancialSettings";
import OperationsSettings from "@/components/Settings/OperationsSettings";
import UserPreferences from "@/components/Settings/UserPreferences";
import NotificationSettings from "@/components/Settings/NotificationSettings";
import SystemSettings from "@/components/Settings/SystemSettings";
import UserManagement from "@/components/Settings/UserManagement";
import { 
  Building, 
  DollarSign, 
  Clock, 
  User, 
  Bell, 
  Settings as SettingsIcon, 
  Users 
} from "lucide-react";

const settingsCategories = [
  { 
    id: 'business', 
    name: 'Business Profile', 
    icon: Building,
    description: 'Company information and branding'
  },
  { 
    id: 'financial', 
    name: 'Financial Settings', 
    icon: DollarSign,
    description: 'Tax, invoicing, and payment settings'
  },
  { 
    id: 'operations', 
    name: 'Operations', 
    icon: Clock,
    description: 'Service settings and business hours'
  },
  { 
    id: 'preferences', 
    name: 'User Preferences', 
    icon: User,
    description: 'Display and timezone preferences'
  },
  { 
    id: 'notifications', 
    name: 'Notifications', 
    icon: Bell,
    description: 'Email and alert preferences'
  },
  { 
    id: 'system', 
    name: 'System Settings', 
    icon: SettingsIcon,
    description: 'Data backup and job requirements'
  },
  { 
    id: 'users', 
    name: 'User Management', 
    icon: Users,
    description: 'Invite and manage team members',
    adminOnly: true
  }
];

export default function Settings() {
  const [activeCategory, setActiveCategory] = useState('business');
  const { user } = useAuth();

  const renderContent = () => {
    switch (activeCategory) {
      case 'business':
        return <BusinessSettings />;
      case 'financial':
        return <FinancialSettings />;
      case 'operations':
        return <OperationsSettings />;
      case 'preferences':
        return <UserPreferences />;
      case 'notifications':
        return <NotificationSettings />;
      case 'system':
        return <SystemSettings />;
      case 'users':
        return <UserManagement />;
      default:
        return <BusinessSettings />;
    }
  };

  const visibleCategories = settingsCategories.filter(category => 
    !category.adminOnly // Show all categories for now, will implement role check later
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="ml-64 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your business configuration and preferences</p>
        </div>

        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <div className="w-80">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuration</CardTitle>
                <CardDescription>
                  Choose a category to configure your settings
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <nav className="space-y-1">
                  {visibleCategories.map((category) => {
                    const Icon = category.icon;
                    const isActive = activeCategory === category.id;
                    
                    return (
                      <button
                        key={category.id}
                        onClick={() => setActiveCategory(category.id)}
                        className={cn(
                          "w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-accent",
                          isActive && "bg-primary text-primary-foreground hover:bg-primary/90"
                        )}
                      >
                        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{category.name}</div>
                          <div className={cn(
                            "text-sm mt-1",
                            isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                          )}>
                            {category.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </CardContent>
            </Card>
          </div>

          {/* Content Area */}
          <div className="flex-1">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}