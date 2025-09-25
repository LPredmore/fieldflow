import { useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useCalendarJobs } from '@/hooks/useCalendarJobs';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Clock, MapPin, User } from 'lucide-react';
import { format } from 'date-fns';

export function EnhancedCalendar() {
  const { jobs, loading } = useCalendarJobs();
  const userTimezone = useUserTimezone();

  // Get calendar events with proper timezone handling
  const calendarEvents = useMemo(() => {
    return jobs.map((job) => ({
      id: job.id,
      title: job.title,
      start: job.start_at, // UTC ISO
      end: job.end_at,     // UTC ISO
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

  // Handle event click
  const handleEventClick = useCallback((clickInfo: any) => {
    const event = clickInfo.event;
    const job = event.extendedProps;

    // TODO: Open job details modal
    alert(`Job: ${event.title}\nLocal Time: ${job.localStart ? format(job.localStart, 'PPp') : 'N/A'}`);
  }, []);

  // Handle date selection
  const handleDateSelect = useCallback((selectInfo: any) => {
    // TODO: Open create job modal with pre-filled date
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
                  {jobs.filter(j => j.status === 'scheduled').length}
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
                  {jobs.filter(j => j.status === 'in_progress').length}
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
                  {jobs.filter(j => j.status === 'completed').length}
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
              <span>Timezone: {userTimezone}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay'
            }}
            events={calendarEvents}
            eventClick={handleEventClick}
            select={handleDateSelect}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            height="auto"
            timeZone={userTimezone}
            slotMinTime="06:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            eventDisplay="block"
            eventDidMount={(info) => {
              const job = info.event.extendedProps;
              
              // Add tooltip with job details
              info.el.setAttribute('title', 
                `${info.event.title}\nCustomer: ${job.customer_name}\nStatus: ${job.status}\nPriority: ${job.priority}`
              );
              
              // Add status indicators
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
              <p><strong>Calendar events:</strong> {calendarEvents.length}</p>
              <p><strong>User timezone:</strong> {userTimezone}</p>
              <p><strong>Sample job times:</strong></p>
              {jobs.slice(0, 2).map(job => (
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