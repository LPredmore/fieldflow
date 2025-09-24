import { EnhancedCalendar } from '@/components/Calendar/EnhancedCalendar';
import { CreateJobDialog } from '@/components/Jobs/CreateJobDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function Calendar() {
  return (
    <div className="space-y-6">
      {/* Quick Actions Bar */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <CreateJobDialog 
          trigger={
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Job
            </Button>
          }
        />
      </div>
      
      <EnhancedCalendar />
    </div>
  );
}