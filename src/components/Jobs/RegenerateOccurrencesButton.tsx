import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw } from 'lucide-react';

interface RegenerateOccurrencesButtonProps {
  seriesId: string;
  onComplete?: () => void;
}

export function RegenerateOccurrencesButton({ seriesId, onComplete }: RegenerateOccurrencesButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleRegenerate = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.functions.invoke('regenerate-occurrences', {
        body: { seriesId }
      });
      
      if (error) throw error;
      
      toast({
        title: "Occurrences regenerated",
        description: data.message,
      });
      
      onComplete?.();
    } catch (error: any) {
      console.error('Error regenerating occurrences:', error);
      toast({
        variant: "destructive",
        title: "Error regenerating occurrences",
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleRegenerate} 
      disabled={isLoading}
      variant="outline"
      size="sm"
    >
      <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'Regenerating...' : 'Fix Occurrences'}
    </Button>
  );
}