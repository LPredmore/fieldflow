import { useState } from 'react';
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Profile } from '@/hooks/useProfiles';
import { PermissionSettings } from './PermissionSettings';
import { UserPermissions } from '@/utils/permissionUtils';

interface UserRowProps {
  profile: Profile;
  isCurrentUser: boolean;
  isExpanded: boolean;
  userPermissions: UserPermissions | null;
  updatingUser: string | null;
  onToggleExpanded: () => void;
  onRoleChange: (profileId: string, newRole: 'business_admin' | 'contractor') => void;
  onPermissionUpdate: () => void;
}

export function UserRow({ 
  profile, 
  isCurrentUser, 
  isExpanded,
  userPermissions,
  updatingUser,
  onToggleExpanded,
  onRoleChange,
  onPermissionUpdate
}: UserRowProps) {
  const isUpdating = updatingUser === profile.id;

  return (
    <>
      <TableRow className="hover:bg-muted/50">
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpanded}
            className="h-6 w-6 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
        
        <TableCell>
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">
                {(profile.full_name || profile.email || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm">
                  {profile.full_name || 'Unnamed User'}
                </p>
                {isCurrentUser && (
                  <Badge variant="outline" className="text-xs">You</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {profile.email}
              </p>
            </div>
          </div>
        </TableCell>
        
        <TableCell>
          {isCurrentUser ? (
            <Badge variant="default" className="text-xs">
              {profile.role === 'business_admin' ? 'Admin' : 'Contractor'}
            </Badge>
          ) : (
            <Select
              value={profile.role}
              onValueChange={(value) => onRoleChange(profile.id, value as 'business_admin' | 'contractor')}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="business_admin">Admin</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
              </SelectContent>
            </Select>
          )}
        </TableCell>
        
        <TableCell>
          <div className="flex items-center justify-end">
            {isUpdating && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </div>
        </TableCell>
      </TableRow>
      
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={4} className="p-0">
            <div className="px-4 pb-4">
              <PermissionSettings
                userId={profile.id}
                userPermissions={userPermissions}
                onPermissionUpdate={onPermissionUpdate}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}