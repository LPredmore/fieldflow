import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PermissionCheckbox } from './PermissionCheckbox';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { UserPermissions } from '@/utils/permissionUtils';

interface PermissionSettingsProps {
  userId: string;
  userPermissions: UserPermissions | null;
  onPermissionUpdate: () => void;
}

export function PermissionSettings({ userId, userPermissions, onPermissionUpdate }: PermissionSettingsProps) {
  const [updatingPermissions, setUpdatingPermissions] = useState<string[]>([]);
  const { updatePermissions } = usePermissions();
  const { tenantId } = useAuth();

  const handlePermissionChange = async (permissionKey: keyof UserPermissions, newValue: boolean) => {
    if (!tenantId) return;
    
    setUpdatingPermissions(prev => [...prev, permissionKey]);
    
    try {
      await updatePermissions(userId, { [permissionKey]: newValue });
      onPermissionUpdate();
    } finally {
      setUpdatingPermissions(prev => prev.filter(p => p !== permissionKey));
    }
  };

  const permissionConfig = [
    {
      key: 'send_quotes' as keyof UserPermissions,
      label: 'Send Quotes',
      description: 'Allow user to copy quote links and send quotes to customers'
    },
    {
      key: 'access_services' as keyof UserPermissions,
      label: 'Services',
      description: 'Allow access to the Services page and service management'
    },
    {
      key: 'access_invoicing' as keyof UserPermissions,
      label: 'Invoicing',
      description: 'Allow access to the Invoices page and invoice management'
    },
    {
      key: 'supervisor' as keyof UserPermissions,
      label: 'Supervisor',
      description: 'Allow changing assigned contractors on jobs'
    },
  ];

  return (
    <Card className="mt-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Permissions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {permissionConfig.map(({ key, label, description }) => (
          <PermissionCheckbox
            key={key}
            label={label}
            description={description}
            checked={userPermissions?.[key] || false}
            loading={updatingPermissions.includes(key)}
            onCheckedChange={(checked) => handlePermissionChange(key, checked)}
          />
        ))}
      </CardContent>
    </Card>
  );
}