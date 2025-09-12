import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, User, Mail, Phone, Lock, Building2, ExternalLink, Info } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Navigation from '@/components/Layout/Navigation';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const { profile, loading, updatePersonalInfo, updateEmail, updatePassword } = useProfile();
  const { settings, loading: settingsLoading } = useSettings();
  const { userRole, isAdmin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const [personalInfo, setPersonalInfo] = useState({
    full_name: '',
    phone: '',
  });

  const [emailForm, setEmailForm] = useState({
    email: '',
  });

  // Synchronize form state with profile data when it loads
  useEffect(() => {
    if (profile) {
      setPersonalInfo({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
      });
      setEmailForm({
        email: profile.email || '',
      });
    }
  }, [profile]);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handlePersonalInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);

    const result = await updatePersonalInfo(personalInfo);
    
    setIsUpdating(false);
    
    if (result.error) {
      toast({
        variant: "destructive",
        title: "Error updating profile",
        description: result.error.message,
      });
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);

    const result = await updateEmail(emailForm.email);
    
    setIsUpdating(false);
    
    if (result.error) {
      toast({
        variant: "destructive",
        title: "Error updating email",
        description: result.error.message,
      });
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Passwords don't match",
        description: "Please make sure both password fields match.",
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
      });
      return;
    }

    setIsUpdating(true);

    const result = await updatePassword(passwordForm.newPassword);
    
    setIsUpdating(false);
    
    if (result.error) {
      toast({
        variant: "destructive",
        title: "Error updating password",
        description: result.error.message,
      });
    } else {
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setShowPasswordForm(false);
    }
  };

  if (loading || settingsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="lg:ml-64">
          <div className="p-6 lg:p-8 flex items-center justify-center min-h-[80vh]">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading profile...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="lg:ml-64">
        <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center space-x-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={profile?.avatar_url || ''} />
          <AvatarFallback className="text-lg">
            {profile?.full_name ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase() : 
             profile?.email ? profile.email[0].toUpperCase() : 'U'}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Profile Settings</h1>
          <p className="text-muted-foreground">Manage your personal information and account settings</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your personal details (individual user info)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePersonalInfoSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Personal Full Name</Label>
                <Input
                  id="full_name"
                  value={personalInfo.full_name}
                  onChange={(e) => setPersonalInfo(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Enter your personal full name"
                />
                <p className="text-sm text-muted-foreground">
                  This is your individual name for user identification
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Personal Phone Number</Label>
                <Input
                  id="phone"
                  value={personalInfo.phone}
                  onChange={(e) => setPersonalInfo(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Enter your personal phone number"
                />
                <p className="text-sm text-muted-foreground">
                  This is your personal contact number
                </p>
              </div>
              <Button 
                type="submit" 
                disabled={isUpdating}
                className="w-full"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Personal Info'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email Settings */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <Mail className="h-5 w-5" />
              Email Address
            </CardTitle>
            <CardDescription>Update your login email address</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={emailForm.email}
                  onChange={(e) => setEmailForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter your email address"
                />
                <p className="text-sm text-muted-foreground">
                  This will update your login email address
                </p>
              </div>
              <Button 
                type="submit" 
                disabled={isUpdating}
                className="w-full"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update Email'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Business Information Context */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Building2 className="h-5 w-5" />
            Business Information
          </CardTitle>
          <CardDescription>
            Current business contact details used in quotes and invoices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Business Name</Label>
                  <Input
                    value={settings.business_name || 'Not set'}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Business Email</Label>
                  <Input
                    value={settings.business_email || 'Not set'}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Business Phone</Label>
                  <Input
                    value={settings.business_phone || 'Not set'}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Business Website</Label>
                  <Input
                    value={settings.business_website || 'Not set'}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="text-blue-800 dark:text-blue-300 font-medium">
                    Business Information Usage
                  </p>
                  <p className="text-blue-700 dark:text-blue-400 mt-1">
                    This information appears on all quotes and invoices. 
                    {isAdmin ? ' You can update it in Business Settings.' : ' Only business administrators can modify this information.'}
                  </p>
                </div>
              </div>
              
              {isAdmin && (
                <Button 
                  onClick={() => navigate('/settings')}
                  variant="outline"
                  className="w-full"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Business Settings
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground">No business information found</p>
              {isAdmin && (
                <Button 
                  onClick={() => navigate('/settings')}
                  variant="outline"
                  className="mt-2"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Set Up Business Information
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-card-foreground">
            <Lock className="h-5 w-5" />
            Password & Security
          </CardTitle>
          <CardDescription>Change your account password</CardDescription>
        </CardHeader>
        <CardContent>
          {!showPasswordForm ? (
            <Button 
              onClick={() => setShowPasswordForm(true)}
              variant="outline"
            >
              Change Password
            </Button>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="Enter new password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm new password"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswordForm({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: '',
                    });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}