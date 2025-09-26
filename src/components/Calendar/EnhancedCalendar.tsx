import { useCallback, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import { useCalendarJobs } from '@/hooks/useCalendarJobs';
import { useUserTimezone } from '@/hooks/useUserTimezone';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

export function EnhancedCalendar() {
  const { jobs, loading, setRange } = useCalendarJobs() as any;
  const userTimezone = useUserTimezone();
  const calendarRef = useRef<FullCalendar>(null);
  const [lastRangeUpdate, setLastRangeUpdate] = useState<string>('');

  // Convert jobs to calendar events
  const calendarEvents = useMemo(() => {
    return jobs.map((job: any) => ({
      id: job.id,
      title: job.title,
      start: new Date(job.start_at),
      end: new Date(job.end_at),
      extendedProps: {
        status: job.status,
        priority: job.priority,
        customer_name: job.customer_name,
        series_id: job.series_id,
        localStart: job.local_start,
        localEnd: job.local_end,
      },
    }));
  }, [jobs]);

  // Handle calendar date range changes with debouncing to prevent infinite loops
  const handleDatesSet = useCallback(
    (arg: { start: Date; end: Date; view: any }) => {
      const newRangeKey = `${arg.start.toISOString()}-${arg.end.toISOString()}`;
      
      // Prevent duplicate range updates that cause infinite loops
      if (newRangeKey === lastRangeUpdate) {
        console.log('🔄 Skipping duplicate range update:', newRangeKey);
        return;
      }
      
      console.log('📅 Calendar range changed:', {
        start: arg.start.toISOString(),
        end: arg.end.toISOString(),
        view: arg.view.type
      });
      
      setLastRangeUpdate(newRangeKey);
      
      // Use setTimeout to debounce and prevent immediate re-renders
      setTimeout(() => {
        setRange?.({
          fromISO: arg.start.toISOString(),
          toISO: arg.end.toISOString()
        });
      }, 100);
    },
    [setRange, lastRangeUpdate]
  );

  // Handle event clicks
  const handleEventClick = useCallback((clickInfo: any) => {
    // Prevent any default behavior that might cause page refresh
    clickInfo.jsEvent.preventDefault();
    clickInfo.jsEvent.stopPropagation();
    
    const event = clickInfo.event;
    const job = event.extendedProps;

    alert(
      `Job: ${event.title}\n` +
      `Customer: ${job.customer_name}\n` +
      `Status: ${job.status}\n` +
      `Priority: ${job.priority}\n` +
      (job.localStart ? `Local Time: ${format(job.localStart, 'PPp')}` : '')
    );
  }, []);

  // Handle date selection
  const handleDateSelect = useCallback((selectInfo: any) => {
    // Prevent any default behavior that might cause page refresh
    selectInfo.jsEvent?.preventDefault();
    selectInfo.jsEvent?.stopPropagation();
    
    alert(`Create job for ${format(selectInfo.start, 'PPP')}`);
  }, []);

  if (loading) {
    return (
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
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Schedule Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Prevent any form submission behavior */}
        <div 
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }}
          onClick={(e) => {
            // Allow clicks but prevent any form submission
            if ((e.target as HTMLElement).tagName === 'BUTTON') {
              e.preventDefault();
            }
          }}
        >
        <div className="calendar-container">
          <style>{`
            .fc-button {
              background: none !important;
              border: 1px solid #d1d5db !important;
              color: #374151 !important;
            }
            .fc-button:hover {
              background: #f3f4f6 !important;
            }
            .fc-button:focus {
              box-shadow: none !important;
            }
            .fc-button-primary {
              background-color: #3b82f6 !important;
              border-color: #3b82f6 !important;
              color: white !important;
            }
            .fc-button-primary:hover {
              background-color: #2563eb !important;
              border-color: #2563eb !important;
            }
          `}</style>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            timeZone={userTimezone}
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            height="600px"
            events={calendarEvents}
            selectable={true}
            selectMirror={true}
            editable={false}
            eventClick={handleEventClick}
            select={handleDateSelect}
            datesSet={handleDatesSet}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={false}
            nowIndicator={true}
            eventTimeFormat={{
              hour: 'numeric',
              minute: '2-digit',
              meridiem: 'short'
            }}
            slotLabelFormat={{
              hour: 'numeric',
              minute: '2-digit',
              meridiem: 'short'
            }}
            // Prevent form submission on navigation
            eventDidMount={(info) => {
              // Ensure calendar events don't trigger form submissions
              info.el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
              });
            }}
            // Add custom event handlers to prevent page refresh
            customButtons={{}}
            buttonText={{
              today: 'Today',
              month: 'Month',
              week: 'Week',
              day: 'Day'
            }}
          />
        </div>
        </div>
      </CardContent>
    </Card>
  );
}