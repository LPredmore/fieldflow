import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, User } from "lucide-react";
import { useProfiles } from "@/hooks/useProfiles";
import { useAuth } from "@/hooks/useAuth";

const inviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function UserManagement() {
  const [isInviting, setIsInviting] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const { profiles, loading, updateProfile, inviteUser } = useProfiles();
  const { user: currentUser } = useAuth();

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
            <div className="space-y-4">
              {profiles.map((profile) => {
                const isCurrentUser = profile.id === currentUser?.id;
                const isUpdating = updatingUser === profile.id;
                
                return (
                  <div 
                    key={profile.id} 
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-foreground">
                          {(profile.full_name || profile.email || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {profile.full_name || 'Unnamed User'}
                          </p>
                          {isCurrentUser && (
                            <Badge variant="outline">You</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {profile.email}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">Role:</span>
                        {isCurrentUser ? (
                          <Badge variant="default">
                            {profile.role === 'business_admin' ? 'Admin' : 'Contractor'}
                          </Badge>
                        ) : (
                          <Select
                            value={profile.role}
                            onValueChange={(value) => handleRoleChange(profile.id, value as 'business_admin' | 'contractor')}
                            disabled={isUpdating}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="business_admin">Admin</SelectItem>
                              <SelectItem value="contractor">Contractor</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        
                        {isUpdating && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Explanation Note */}
      <Card>
        <CardContent className="p-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> New users invited to your team will default to the "Contractor" 
              role and can be promoted to "Admin" here. Admins have full access to all business 
              settings and can manage other team members.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}