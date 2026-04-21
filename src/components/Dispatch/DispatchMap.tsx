import { useEffect, useMemo } from 'react';
import Map, { Marker, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DispatchContractor, DispatchJob } from '@/hooks/useDispatchDay';

interface Props {
  token: string | null;
  jobs: DispatchJob[];
  contractors: DispatchContractor[];
  laneColors: Record<string, string>;
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
}

export function DispatchMap({
  token,
  jobs,
  contractors,
  laneColors,
  selectedJobId,
  onSelectJob,
}: Props) {
  const mapped = jobs.filter(
    (j) => j.customer_lat != null && j.customer_lng != null
  );

  const center = useMemo(() => {
    if (mapped.length === 0) return { longitude: -95, latitude: 39, zoom: 3.5 };
    const lats = mapped.map((j) => j.customer_lat as number);
    const lngs = mapped.map((j) => j.customer_lng as number);
    return {
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      zoom: 10,
    };
  }, [mapped]);

  // Force re-init map when token first arrives
  useEffect(() => {}, [token]);

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        <div>
          <MapPin className="mx-auto mb-2 h-6 w-6 opacity-50" />
          Map unavailable. Mapbox token could not be loaded.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden rounded-lg border">
      <Map
        mapboxAccessToken={token}
        initialViewState={center}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />

        {contractors.map((c) =>
          c.last_known_lat != null && c.last_known_lng != null ? (
            <Marker
              key={`tech-${c.id}`}
              longitude={c.last_known_lng}
              latitude={c.last_known_lat}
              anchor="center"
            >
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-background opacity-70 shadow"
                style={{ backgroundColor: laneColors[c.id] || '#94a3b8' }}
                title={`${c.full_name || 'Contractor'} — last seen`}
              >
                <Home className="h-2.5 w-2.5 text-primary-foreground" />
              </div>
            </Marker>
          ) : null
        )}

        {mapped.map((j) => {
          const color =
            laneColors[j.assigned_to_user_id || 'unassigned'] || '#64748b';
          const selected = selectedJobId === j.id;
          return (
            <Marker
              key={j.id}
              longitude={j.customer_lng as number}
              latitude={j.customer_lat as number}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectJob(j.id);
              }}
            >
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 -translate-y-1 items-center justify-center rounded-full border-2 border-background text-[11px] font-bold text-primary-foreground shadow-md transition-transform',
                  selected && 'scale-125 ring-2 ring-primary'
                )}
                style={{ backgroundColor: color }}
                title={j.customer_name}
              >
                {j.dispatch_sequence ?? '•'}
              </button>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
