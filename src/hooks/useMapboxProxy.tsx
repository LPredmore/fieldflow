import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface GeocodeTarget {
  customer_id: string;
  query: string;
}
export interface GeocodeResult {
  customer_id: string;
  lat: number | null;
  lng: number | null;
  status: 'ok' | 'failed';
}

async function invoke<T>(
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('mapbox-proxy', {
    body,
  });
  if (error) return { data: null, error: error.message };
  if (data && typeof data === 'object' && 'error' in data) {
    return { data: null, error: String((data as { error: unknown }).error) };
  }
  return { data: data as T, error: null };
}

export function useMapboxProxy() {
  const [tileToken, setTileToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const mintTileToken = useCallback(async () => {
    setTokenLoading(true);
    setTokenError(null);
    const { data, error } = await invoke<{ token: string }>({
      action: 'mint_tile_token',
    });
    setTokenLoading(false);
    if (error || !data) {
      setTokenError(error ?? 'Failed to load Mapbox token');
      return null;
    }
    setTileToken(data.token);
    return data.token;
  }, []);

  useEffect(() => {
    void mintTileToken();
  }, [mintTileToken]);

  const geocode = useCallback(async (targets: GeocodeTarget[]) => {
    if (targets.length === 0) return [];
    const { data, error } = await invoke<{ results: GeocodeResult[] }>({
      action: 'geocode',
      targets,
    });
    if (error || !data) {
      toast({
        title: 'Geocoding failed',
        description: error ?? 'Unknown error',
        variant: 'destructive',
      });
      return [];
    }
    return data.results;
  }, []);

  const matrix = useCallback(
    async (coordinates: Array<[number, number]>) => {
      if (coordinates.length < 2) return null;
      const { data, error } = await invoke<{ minutes: (number | null)[][] }>({
        action: 'matrix',
        coordinates,
      });
      if (error || !data) {
        toast({
          title: 'ETA calculation failed',
          description: error ?? 'Unknown error',
          variant: 'destructive',
        });
        return null;
      }
      return data.minutes;
    },
    []
  );

  return {
    tileToken,
    tokenLoading,
    tokenError,
    refreshTileToken: mintTileToken,
    geocode,
    matrix,
  };
}
