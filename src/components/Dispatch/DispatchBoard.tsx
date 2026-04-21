import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Loader2, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDispatchDay, type DispatchJob } from '@/hooks/useDispatchDay';
import { useMapboxProxy } from '@/hooks/useMapboxProxy';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { optimizeRoute } from '@/lib/routeOptimizer';
import { GeocodingBanner } from './GeocodingBanner';
import { ContractorLane } from './ContractorLane';
import { DispatchMap } from './DispatchMap';

const LANE_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#0891b2',
  '#ca8a04',
  '#db2777',
];
const UNASSIGNED_COLOR = '#94a3b8';

export function DispatchBoard() {
  const { date, setDate, loading, contractors, jobs, needsGeocodingCount, refresh } =
    useDispatchDay();
  const { tileToken, matrix } = useMapboxProxy();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);

  const laneColors = useMemo(() => {
    const map: Record<string, string> = { unassigned: UNASSIGNED_COLOR };
    contractors.forEach((c, i) => {
      map[c.id] = LANE_PALETTE[i % LANE_PALETTE.length];
    });
    return map;
  }, [contractors]);

  const jobsByLane = useMemo(() => {
    const grouped: Record<string, DispatchJob[]> = { unassigned: [] };
    contractors.forEach((c) => {
      grouped[c.id] = [];
    });
    jobs.forEach((j) => {
      const key = j.assigned_to_user_id || 'unassigned';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(j);
    });
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => {
        const sa = a.dispatch_sequence ?? 999;
        const sb = b.dispatch_sequence ?? 999;
        if (sa !== sb) return sa - sb;
        return a.start_at.localeCompare(b.start_at);
      })
    );
    return grouped;
  }, [jobs, contractors]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const jobId = event.active.id as string;
    const overId = event.over?.id as string | undefined;
    if (!overId) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    const newAssignee = overId === 'unassigned' ? null : overId;
    if (job.assigned_to_user_id === newAssignee) return;
    const { error } = await supabase
      .from('job_occurrences')
      .update({
        assigned_to_user_id: newAssignee,
        dispatch_sequence: null,
        drive_minutes_from_prev: null,
      })
      .eq('id', jobId);
    if (error) {
      toast({
        title: 'Reassignment failed',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Job reassigned' });
    await refresh();
  };

  const handleOptimize = async (contractorId: string) => {
    if (!matrix) return;
    setOptimizingId(contractorId);
    try {
      const lane = jobsByLane[contractorId] || [];
      const stops = lane.filter(
        (j) => j.customer_lat != null && j.customer_lng != null
      );
      if (stops.length < 2) {
        toast({ title: 'Need at least 2 mapped stops to optimize.' });
        return;
      }
      if (stops.length > 15) {
        toast({
          title: 'Too many stops',
          description: 'Optimizer caps at 15 stops per lane.',
          variant: 'destructive',
        });
        return;
      }
      const contractor = contractors.find((c) => c.id === contractorId);
      const start =
        contractor?.home_base_lat != null && contractor?.home_base_lng != null
          ? ([contractor.home_base_lng, contractor.home_base_lat] as [
              number,
              number,
            ])
          : ([stops[0].customer_lng as number, stops[0].customer_lat as number] as [
              number,
              number,
            ]);
      const coords: Array<[number, number]> = [
        start,
        ...stops.map(
          (s) =>
            [s.customer_lng as number, s.customer_lat as number] as [number, number]
        ),
      ];
      const m = await matrix(coords);
      if (!m) return;
      const result = optimizeRoute(m, 0);
      // result.order[0] is start (index 0). Skip it; remaining indices are stops+1.
      const orderedStops: Array<{ job: DispatchJob; driveMin: number }> = [];
      for (let i = 1; i < result.order.length; i++) {
        const matrixIdx = result.order[i];
        const prevMatrixIdx = result.order[i - 1];
        const job = stops[matrixIdx - 1];
        const drive = m[prevMatrixIdx]?.[matrixIdx] ?? 0;
        orderedStops.push({ job, driveMin: drive ?? 0 });
      }
      // Persist sequence + drive minutes
      for (let idx = 0; idx < orderedStops.length; idx++) {
        const { job, driveMin } = orderedStops[idx];
        await supabase
          .from('job_occurrences')
          .update({
            dispatch_sequence: idx + 1,
            drive_minutes_from_prev: idx === 0 ? null : Math.round(driveMin),
          })
          .eq('id', job.id);
      }
      toast({
        title: 'Route optimized',
        description: `Total drive: ${result.totalDriveMinutes} min`,
      });
      await refresh();
    } finally {
      setOptimizingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
          <Button variant="outline" size="sm" onClick={() => refresh()}>
            <RefreshCcw className="mr-1.5 h-3 w-3" />
            Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} ·{' '}
          {contractors.length}{' '}
          {contractors.length === 1 ? 'contractor' : 'contractors'}
        </p>
      </div>

      <GeocodingBanner count={needsGeocodingCount} onComplete={refresh} />

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading dispatch board…
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              {contractors.map((c) => (
                <ContractorLane
                  key={c.id}
                  contractorId={c.id}
                  contractor={c}
                  jobs={jobsByLane[c.id] || []}
                  color={laneColors[c.id]}
                  selectedJobId={selectedJobId}
                  onSelectJob={setSelectedJobId}
                  onOptimize={() => handleOptimize(c.id)}
                  optimizing={optimizingId === c.id}
                  canOptimize={Boolean(tileToken)}
                />
              ))}
              <ContractorLane
                contractorId="unassigned"
                jobs={jobsByLane.unassigned || []}
                color={UNASSIGNED_COLOR}
                selectedJobId={selectedJobId}
                onSelectJob={setSelectedJobId}
              />
            </div>
            <div className="h-[70vh] min-h-[480px] lg:sticky lg:top-4">
              <DispatchMap
                token={tileToken}
                jobs={jobs}
                contractors={contractors}
                laneColors={laneColors}
                selectedJobId={selectedJobId}
                onSelectJob={setSelectedJobId}
              />
            </div>
          </div>
        </DndContext>
      )}
    </div>
  );
}
