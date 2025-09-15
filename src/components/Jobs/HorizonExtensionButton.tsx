import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export function HorizonExtensionButton() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleExtendHorizon = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('extend-horizon', {
        body: {
          horizonDays: 90,
          batchSize: 10
        }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Horizon Extended",
        description: `Successfully extended ${data.results?.succeeded || 0} job series`,
      });
    } catch (error: any) {
      console.error('Error extending horizon:', error);
      toast({
        title: "Extension Failed",
        description: error.message || "Failed to extend horizon",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleExtendHorizon} 
      disabled={loading}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Extending...' : 'Extend Horizon'}
    </Button>
  );
}