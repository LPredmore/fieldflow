import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  tenantId: string | null;
  userRole: 'business_admin' | 'contractor' | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, phone: string, companyName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'business_admin' | 'contractor' | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Fetch tenant ID and user role when user logs in
        if (session?.user) {
          setTimeout(async () => {
            try {
              const [tenantResult, profileResult] = await Promise.all([
                supabase.rpc('get_user_tenant_id'),
                supabase.from('profiles').select('role').eq('id', session.user.id).single()
              ]);
              
              if (!tenantResult.error && tenantResult.data) {
                setTenantId(tenantResult.data);
              } else {
                console.error('Error fetching tenant ID:', tenantResult.error);
              }

              if (!profileResult.error && profileResult.data) {
                setUserRole(profileResult.data.role);
              } else {
                console.error('Error fetching user role:', profileResult.error);
              }
            } catch (error) {
              console.error('Error fetching user data:', error);
            }
          }, 0);
        } else {
          setTenantId(null);
          setUserRole(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Fetch tenant ID and user role for existing session
      if (session?.user) {
        try {
          const [tenantResult, profileResult] = await Promise.all([
            supabase.rpc('get_user_tenant_id'),
            supabase.from('profiles').select('role').eq('id', session.user.id).single()
          ]);
          
          if (!tenantResult.error && tenantResult.data) {
            setTenantId(tenantResult.data);
          } else {
            console.error('Error fetching tenant ID for existing session:', tenantResult.error);
          }

          if (!profileResult.error && profileResult.data) {
            setUserRole(profileResult.data.role);
          } else {
            console.error('Error fetching user role for existing session:', profileResult.error);
          }
        } catch (error) {
          console.error('Error fetching user data for existing session:', error);
        }
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        toast({
          variant: "destructive",
          title: "Sign in failed",
          description: error.message,
        });
      }
      
      return { error };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign in failed",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, phone: string, companyName: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
            phone: phone,
            company_name: companyName,
          },
        },
      });
      
      if (error) {
        toast({
          variant: "destructive",
          title: "Sign up failed",
          description: error.message,
        });
      } else {
        toast({
          title: "Check your email",
          description: "We've sent you a confirmation link to complete your registration.",
        });
      }
      
      return { error };
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign up failed",
        description: "An unexpected error occurred. Please try again.",
      });
      return { error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast({
          variant: "destructive",
          title: "Sign out failed",
          description: error.message,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description: "An unexpected error occurred. Please try again.",
      });
    }
  };

  const value = {
    user,
    session,
    loading,
    tenantId,
    userRole,
    isAdmin: userRole === 'business_admin',
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}