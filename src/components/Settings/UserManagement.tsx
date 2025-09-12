import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, User } from "lucide-react";
import { useProfiles } from "@/hooks/useProfiles";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { UserPermissions } from "@/utils/permissionUtils";
import { UserTable } from "./UserManagement/UserTable";
import { UserRow } from "./UserManagement/UserRow";
import { supabase } from '@/integrations/supabase/client';

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function UserManagement() {
  const [isInviting, setIsInviting] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userPermissions, setUserPermissions] = useState<Record<string, UserPermissions | null>>({});
  const { profiles, loading, updateProfile, inviteUser } = useProfiles();
  const { user: currentUser } = useAuth();
  const { refetchPermissions } = usePermissions();

  const inviteForm = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
    },
  });

  // Show user management to all users for now
  // Role-based access will be implemented when auth hook is updated

  const onInviteSubmit = async (data: InviteFormData) => {
    setIsInviting(true);
    
    try {
      await inviteUser(data.email);
      inviteForm.reset();
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (profileId: string, newRole: 'business_admin' | 'contractor') => {
    setUpdatingUser(profileId);
    
    try {
      await updateProfile(profileId, { role: newRole });
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleToggleExpanded = (userId: string) => {
    setExpandedUser(expandedUser === userId ? null : userId);
  };

  const fetchUserPermissions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('send_quotes, access_services, access_invoicing, supervisor')
        .eq('user_id', userId)
        .single();

      if (!error) {
        setUserPermissions(prev => ({ ...prev, [userId]: data }));
      } else if (error.code === 'PGRST116') {
        // No permissions found, set defaults
        setUserPermissions(prev => ({ 
          ...prev, 
          [userId]: {
            send_quotes: false,
            access_services: false,
            access_invoicing: false,
            supervisor: false
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching user permissions:', error);
    }
  };

  const handlePermissionUpdate = () => {
    // Refetch permissions for all users
    profiles.forEach(profile => {
      fetchUserPermissions(profile.id);
    });
  };

  // Fetch permissions for expanded user
  useEffect(() => {
    if (expandedUser) {
      fetchUserPermissions(expandedUser);
    }
  }, [expandedUser]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite New User */}
      <Card>
        <CardHeader>
          <CardTitle>Invite New User</CardTitle>
          <CardDescription>
            Send an invitation to add a new contractor to your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...inviteForm}>
            <form onSubmit={inviteForm.handleSubmit(onInviteSubmit)} className="flex gap-4">
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input 
                        placeholder="contractor@example.com" 
                        type="email"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button type="submit" disabled={isInviting}>
                {isInviting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Invite
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Team Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            Manage roles and permissions for your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <div className="text-center py-8">
              <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No team members yet</p>
              <p className="text-sm text-muted-foreground">
                Invite contractors to start building your team
              </p>
            </div>
          ) : (
            <UserTable>
              {profiles.map((profile) => {
                const isCurrentUser = profile.id === currentUser?.id;
                const isExpanded = expandedUser === profile.id;
                
                return (
                  <UserRow
                    key={profile.id}
                    profile={profile}
                    isCurrentUser={isCurrentUser}
                    isExpanded={isExpanded}
                    userPermissions={userPermissions[profile.id] || null}
                    updatingUser={updatingUser}
                    onToggleExpanded={() => handleToggleExpanded(profile.id)}
                    onRoleChange={handleRoleChange}
                    onPermissionUpdate={handlePermissionUpdate}
                  />
                );
              })}
            </UserTable>
          )}
        </CardContent>
      </Card>

      {/* Explanation Note */}
      <Card>
        <CardContent className="p-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> Click the arrow next to a user's name to expand and manage their specific permissions. 
              New users invited to your team will default to the "Contractor" role with no special permissions. 
              Admins have full access to all business settings and can manage other team members.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}