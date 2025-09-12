import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { 
  Home, 
  Briefcase, 
  Users, 
  FileText, 
  Receipt, 
  Calendar,
  Settings,
  Menu,
  X,
  Wrench,
  User,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { getRoleDisplayName, canAccessSettings } from "@/utils/roleUtils";

const navigationItems = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Jobs", href: "/jobs", icon: Briefcase },
  { name: "Customers", href: "/customers", icon: Users },
  { name: "Services", href: "/services", icon: Wrench },
  { name: "Quotes", href: "/quotes", icon: FileText },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Profile", href: "/profile", icon: User },
  { name: "Settings", href: "/settings", icon: Settings },
];

export default function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { signOut, user, userRole } = useAuth();
  const { settings } = useSettings();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="bg-surface shadow-material-md"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation Sidebar */}
      <nav className={cn(
        "fixed left-0 top-0 z-40 h-full w-64 bg-surface border-r border-border shadow-material-lg transition-transform duration-normal lg:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-start border-b border-border bg-primary px-6 gap-3">
            {settings?.logo_url && (
              <img 
                src={settings.logo_url} 
                alt="Business Logo" 
                className="h-8 w-8 object-contain"
              />
            )}
            <h1 className="text-xl font-bold text-primary-foreground">
              {settings?.business_name || 'FieldFlow'}
            </h1>
          </div>

          {/* Navigation Items */}
          <div className="flex-1 space-y-1 px-3 py-4">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              // Hide Settings for non-admin users
              if (item.name === 'Settings' && !canAccessSettings(userRole)) {
                return null;
              }
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-fast hover:bg-accent hover:text-accent-foreground",
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-material-sm" 
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          {/* User Section */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-sm font-medium text-primary-foreground">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {userRole ? getRoleDisplayName(userRole) : 'Loading...'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
}