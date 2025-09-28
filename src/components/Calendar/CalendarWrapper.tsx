import { lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon } from 'lucide-react';

// Lazy load the heavy FullCalendar component to reduce initial bundle size
const EnhancedCalendar = lazy(() => import('./EnhancedCalendar').then(module => ({
  default: module.EnhancedCalendar
})));

// Loading fallback component
const CalendarLoadingFallback = () => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <CalendarIcon className="h-5 w-5" />
        Loading Calendar...
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="animate-pulse space-y-4">
        <div className="h-96 bg-muted rounded-lg"></div>
      </div>
    </CardContent>
  </Card>
);

export function CalendarWrapper() {
  return (
    <Suspense fallback={<CalendarLoadingFallback />}>
      <EnhancedCalendar />
    </Suspense>
  );
}