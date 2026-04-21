import { useDroppable } from '@dnd-kit/core';
import { User, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { JobCard } from './JobCard';
import type { DispatchContractor, DispatchJob } from '@/hooks/useDispatchDay';

interface Props {
  contractorId: string | 'unassigned';
  contractor?: DispatchContractor;
  jobs: DispatchJob[];
  color: string;
  selectedJobId: string | null;
  onSelectJob: (id: string) => void;
  onOptimize?: () => void;
  optimizing?: boolean;
  canOptimize?: boolean;
}

export function ContractorLane({
  contractorId,
  contractor,
  jobs,
  color,
  selectedJobId,
  onSelectJob,
  onOptimize,
  optimizing,
  canOptimize,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: contractorId });
  const isUnassigned = contractorId === 'unassigned';
  const label = isUnassigned
    ? 'Unassigned'
    : contractor?.full_name || contractor?.email || 'Contractor';

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border bg-card p-3 transition-colors',
        isOver && 'border-primary bg-primary/5'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
            style={{ backgroundColor: color }}
          >
            <User className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">{label}</p>
            <p className="text-[11px] text-muted-foreground">
              {jobs.length} {jobs.length === 1 ? 'stop' : 'stops'}
            </p>
          </div>
        </div>
        {!isUnassigned && onOptimize && (
          <Button
            size="sm"
            variant="outline"
            onClick={onOptimize}
            disabled={optimizing || !canOptimize || jobs.length < 2}
            title={
              !canOptimize
                ? 'Mapbox token unavailable'
                : jobs.length < 2
                  ? 'Need at least 2 stops'
                  : 'Optimize this day'
            }
          >
            {optimizing ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3 w-3" />
            )}
            Optimize
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {jobs.length === 0 ? (
          <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Drop jobs here
          </div>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              laneColor={color}
              selected={selectedJobId === job.id}
              onSelect={() => onSelectJob(job.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
