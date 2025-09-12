import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { UserPermissions } from '@/utils/permissionUtils';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface PermissionProtectedRouteProps {
  children: ReactNode;
  requiredPermission: keyof UserPermissions;
  fallbackMessage?: string;
}

export function PermissionProtectedRoute({ 
  children, 
  requiredPermission, 
  fallbackMessage 
}: PermissionProtectedRouteProps) {
  const { loading: authLoading, user } = useAuth();
  const { permissions, loading: permissionsLoading } = usePermissions();

  if (authLoading || permissionsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const hasPermission = permissions?.[requiredPermission] === true;

  if (!hasPermission) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-orange-500" />
            </div>
            <CardTitle className="text-xl">Access Denied</CardTitle>
            <CardDescription>
              {fallbackMessage || `You don't have permission to access this page. Please contact your administrator if you believe this is an error.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Required permission: <code className="bg-muted px-2 py-1 rounded text-xs">{requiredPermission}</code>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}