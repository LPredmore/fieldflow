import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { Shield, User } from "lucide-react";

export default function RoleIndicator() {
  const { userRole, isAdmin } = useAuth();

  if (!userRole) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md border">
      {isAdmin ? (
        <Shield className="h-4 w-4 text-primary" />
      ) : (
        <User className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm font-medium">
        {isAdmin ? "Admin View" : "Contractor View"}
      </span>
      <Badge variant={isAdmin ? "default" : "secondary"} className="text-xs">
        {isAdmin ? "Full Access" : "Limited Access"}
      </Badge>
    </div>
  );
}