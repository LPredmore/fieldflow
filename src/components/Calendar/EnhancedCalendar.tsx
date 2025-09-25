// src/components/Calendar/EnhancedCalendar.tsx
// REQUIREMENTS:
//   npm i @fullcalendar/luxon3 luxon
//
// Fixes timezone display by:
//  - Adding FullCalendar's Luxon plugin (for named IANA zones)
//  - Passing Date objects (constructed from UTC ISO strings) to FullCalendar
//  - Setting timeZone to the browser's IANA string from useUserTimezone()

import { useCallback, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxon3Plugin from '@fullcalendar/luxon3';

import { useCalendarJobs } from '@/hooks/useCalendarJobs';
import { useUserTimezone } from '@/hooks/useUserTimezone';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Clock, MapPin, User } from 'lucide-react';
import { format } from 'date-fns';

export function EnhancedCalendar() {
  // If you replaced useCalendarJobs with the version I provided,
  // it also returns { range, setRange, refetch }. We only need setRange here.
  const { jobs, loading, setRange } = useCalendarJobs() as any;
  const userTimezone = useUserTimezone(); // e.g., "Europe/London", "America/New_York"
  const calendarRef = useRef<FullCalendar>(null);

  // Convert to Date objects so FullCalendar can render in the selected timeZone
  const calendarEvents = useMemo(() => {
    return jobs.map((job: any) => ({
      id: job.id,
      title: job.title,
      start: new Date(job.start_at), // job.start_at is UTC ISO, Date keeps absolute moment
      end: new Date(job.end_at),
      extendedProps: {
        status: job.status,
        priority: job.priority,
        customer_name: job.customer_name,
        series_id: job.series_id,
        localStart: job.local_start, // optional, for tooltips or side UI
        localEnd: job.local_end,
      },
    }));
  }, [jobs]);

  // Update the data-fetch range whenever the visible dates change
  const handleDatesSet = useCallback(
    (arg: { start: Date; end: Date; view: any }) => {
      console.log('Calendar datesSet:', { 
        start: arg.start.toISOString(), 
        end: arg.end.toISOString(),
        view: arg.view.type 
      });
      // Inclusive start, exclusive end works well with .gte / .lt in the hook
      setRange?.({ fromISO: arg.start.toISOString(), toISO: arg.end.toISOString() });
    },
    [setRange]
  );

  const handleEventClick = useCallback((clickInfo: any) => {
    const event = clickInfo.event;
    const job = event.extendedProps;

    // Example details (replace with a modal as needed)
    alert(
      `Job: ${event.title}\n` +
      `Customer: ${job.customer_name}\n` +
      `Status: ${job.status}\n` +
      `Priority: ${job.priority}\n` +
      (job.localStart ? `Local Time: ${format(job.localStart, 'PPp')}` : '')
    );
  }, []);

  const handleDateSelect = useCallback((selectInfo: any) => {
    // Replace with your "Create Job" modal
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
    <div className="space-y-6">
      {/* Calendar Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Jobs</p>
                <p className="text-2xl font-bold">{jobs.length}</p>
              </div>
              <CalendarIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold text-blue-600">
                  {jobs.filter((j: any) => j.status === 'scheduled').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-orange-600">
                  {jobs.filter((j: any) => j.status === 'in_progress').length}
                </p>
              </div>
              <User className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {jobs.filter((j: any) => j.status === 'completed').length}
                </p>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Done
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Job Calendar
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Timezone: {userTimezone || 'local'}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxon3Plugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            // CRITICAL: named IANA timezone + luxon plugin
            timeZone={userTimezone || 'local'}
            // Provide Date objects so FC can convert correctly
            events={calendarEvents}
            // Keep user interactions
            eventClick={handleEventClick}
            select={handleDateSelect}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            height="auto"
            slotMinTime="06:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            eventDisplay="block"
            // Navigation debugging and handling
            viewDidMount={(info) => {
              console.log('Calendar view mounted:', info.view.type, info.view.title);
            }}
            // Update data range when the visible window changes
            datesSet={handleDatesSet}
            // Event styling
            eventDidMount={(info) => {
              const job = info.event.extendedProps as any;

              // Simple tooltip
              info.el.setAttribute(
                'title',
                `${info.event.title}\nCustomer: ${job.customer_name}\nStatus: ${job.status}\nPriority: ${job.priority}`
              );

              // Visual cues
              if (job.priority === 'urgent') {
                info.el.style.borderLeft = '4px solid #ef4444';
              }
              if (job.status === 'completed') {
                info.el.style.opacity = '0.7';
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <Card>
          <CardHeader>
            <CardTitle>Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>Jobs loaded:</strong> {jobs.length}</p>
              <p><strong>User timezone:</strong> {userTimezone || 'local'}</p>
              <p><strong>Sample job times:</strong></p>
              {jobs.slice(0, 2).map((job: any) => (
                <div key={job.id} className="ml-4 p-2 bg-muted rounded">
                  <p><strong>{job.title}</strong></p>
                  <p>UTC: {job.start_at} → {job.end_at}</p>
                  <p>Local: {job.local_start?.toLocaleString()} → {job.local_end?.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
