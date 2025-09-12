import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { Loader2, Building, UserCheck, Mail, ArrowLeft } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { signIn, signUp, resetPassword, user, loading: authLoading } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to main page if already authenticated
  useEffect(() => {
    if (user && !authLoading) {
      const redirectTo = (location.state as any)?.from?.pathname || '/';
      navigate(redirectTo, { replace: true });
    }
  }, [user, authLoading, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (showForgotPassword) {
        const { error } = await resetPassword(email);
        if (!error) {
          setShowForgotPassword(false);
          setEmail('');
        }
      } else if (isLogin) {
        const { error } = await signIn(email, password);
        if (!error) {
          const redirectTo = (location.state as any)?.from?.pathname || '/';
          navigate(redirectTo, { replace: true });
        }
      } else {
        const { error } = await signUp(email, password, fullName, phone, companyName);
        if (!error) {
          // Stay on auth page to show confirmation message
          setIsLogin(true);
          setEmail('');
          setPassword('');
          setFullName('');
          setPhone('');
          setCompanyName('');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-light/10 to-accent/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-light/10 to-accent/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center space-x-2">
            {settings?.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt="Business Logo" 
                className="h-8 w-8 object-contain"
              />
            ) : (
              <Building className="h-8 w-8 text-primary" />
            )}
            <h1 className="text-3xl font-bold text-foreground">
              {settings?.business_name || 'FieldFlow'}
            </h1>
          </div>
          <p className="text-muted-foreground">
            Professional field service management platform
          </p>
        </div>

        <Card className="shadow-material-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold text-center">
              {showForgotPassword ? 'Reset your password' : (isLogin ? 'Welcome back' : 'Create your account')}
            </CardTitle>
            <CardDescription className="text-center">
              {showForgotPassword 
                ? 'Enter your email address to receive a password reset link'
                : (isLogin 
                  ? `Sign in to your ${settings?.business_name || 'FieldFlow'} account` 
                  : `Get started with ${settings?.business_name || 'FieldFlow'} today`
                )
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showForgotPassword && (
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForgotPassword(false);
                  setEmail('');
                }}
                className="mb-4 p-0 h-auto text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to sign in
              </Button>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && !showForgotPassword && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      placeholder="Enter your full name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required={!isLogin}
                      className="transition-all duration-normal"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="Enter your phone number"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required={!isLogin}
                      className="transition-all duration-normal"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="Enter your company name"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required={!isLogin}
                      className="transition-all duration-normal"
                    />
                  </div>
                </>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  placeholder="Enter your email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="transition-all duration-normal"
                />
              </div>
              
              {!showForgotPassword && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {isLogin && (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setShowForgotPassword(true)}
                        className="p-0 h-auto text-sm text-muted-foreground hover:text-foreground"
                      >
                        Forgot password?
                      </Button>
                    )}
                  </div>
                  <Input
                    id="password"
                    placeholder="Enter your password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="transition-all duration-normal"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {showForgotPassword ? 'Sending email...' : (isLogin ? 'Signing in...' : 'Creating account...')}
                  </>
                ) : (
                  <>
                    {showForgotPassword ? (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        Send Reset Email
                      </>
                    ) : (
                      <>
                        <UserCheck className="mr-2 h-4 w-4" />
                        {isLogin ? 'Sign In' : 'Sign Up'}
                      </>
                    )}
                  </>
                )}
              </Button>
            </form>

            {!showForgotPassword && (
              <>
                <Separator />

                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setIsLogin(!isLogin)}
                    className="w-full"
                    disabled={loading}
                  >
                    {isLogin ? 'Create new account' : 'Sign in instead'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}