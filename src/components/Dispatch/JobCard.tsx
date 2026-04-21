import { useDraggable } from '@dnd-kit/core';
import { Clock, MapPin, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DispatchJob } from '@/hooks/useDispatchDay';
import { formatAddressOneLine } from '@/lib/geocoding';

interface Props {
  job: DispatchJob;
  laneColor: string;
  selected?: boolean;
  onSelect?: () => void;
}

export function JobCard({ job, laneColor, selected, onSelect }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    data: { job },
  });

  const startTime = new Date(job.start_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const hasCoords = job.customer_lat != null && job.customer_lng != null;
  const addrLine = formatAddressOneLine(job.customer_address);

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={cn(
        'group relative w-full rounded-md border bg-card p-3 text-left shadow-sm transition-all',
        'hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDragging && 'opacity-50',
        selected && 'ring-2 ring-primary'
      )}
      style={{ borderLeft: `4px solid ${laneColor}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {startTime}
            {job.dispatch_sequence != null && (
              <span
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground"
                style={{ backgroundColor: laneColor }}
              >
                {job.dispatch_sequence}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-medium">
            {job.override_title || job.series_title || 'Job'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {job.customer_name}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {job.drive_minutes_from_prev != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            <Navigation className="h-3 w-3" />
            {job.drive_minutes_from_prev} min drive
          </span>
        )}
        {!hasCoords && (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
            <MapPin className="h-3 w-3" />
            No address
          </span>
        )}
        {addrLine && hasCoords && (
          <span className="truncate text-muted-foreground" title={addrLine}>
            {addrLine}
          </span>
        )}
      </div>
    </button>
  );
}
