import { useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useMapboxProxy } from '@/hooks/useMapboxProxy';
import { formatAddressOneLine } from '@/lib/geocoding';
import { toast } from '@/hooks/use-toast';

interface Props {
  count: number;
  onComplete: () => void;
}

export function GeocodingBanner({ count, onComplete }: Props) {
  const { geocode } = useMapboxProxy();
  const [running, setRunning] = useState(false);

  if (count === 0) return null;

  const handleRun = async () => {
    setRunning(true);
    try {
      const { data: targets, error } = await supabase.rpc(
        'get_unbatched_geocoding_targets',
        { _limit: 50 }
      );
      if (error) throw error;
      const payload = (targets || [])
        .map((t) => ({
          customer_id: t.id,
          query: formatAddressOneLine(
            t.address as Record<string, string | null> | null
          ),
        }))
        .filter((p) => p.query.length > 3);
      if (payload.length === 0) {
        toast({ title: 'Nothing to geocode' });
        return;
      }
      const results = await geocode(payload);
      const ok = results.filter((r) => r.status === 'ok').length;
      const failed = results.length - ok;
      toast({
        title: 'Geocoding complete',
        description: `${ok} updated, ${failed} failed`,
      });
      onComplete();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm">
          <span className="font-medium">{count}</span>{' '}
          {count === 1 ? 'customer needs' : 'customers need'} to be geocoded for
          map view & ETAs.
        </p>
      </div>
      <Button size="sm" onClick={handleRun} disabled={running}>
        {running ? (
          <>
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            Geocoding…
          </>
        ) : (
          'Geocode now'
        )}
      </Button>
    </div>
  );
}
