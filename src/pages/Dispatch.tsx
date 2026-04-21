import { DispatchBoard } from '@/components/Dispatch/DispatchBoard';

export default function Dispatch() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Dispatch</h1>
        <p className="text-sm text-muted-foreground">
          Plan today's routes — drag jobs between contractors, optimize by drive
          time, see everyone on the map.
        </p>
      </div>
      <DispatchBoard />
    </div>
  );
}
