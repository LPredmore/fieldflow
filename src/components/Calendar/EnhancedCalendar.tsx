import { useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useJobScheduler } from '@/hooks/useJobScheduler';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Clock, MapPin, User } from 'lucide-react';
import { format } from 'date-fns';

export function EnhancedCalendar() {
  const { jobs, loading, getCalendarEvents } = useJobScheduler();
  const userTimezone = useUserTimezone();

  // Get calendar events with proper timezone handling
  const calendarEvents = useMemo(() => {
    const events = getCalendarEvents();
    
    console.log('🖥️ EnhancedCalendar received events:', {
      total_events: events.length,
      user_timezone: userTimezone,
      browser_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sample_events: events.slice(0, 2).map(event => ({
        title: event.title,
        start: event.start,
        end: event.end,
        start_as_date: new Date(event.start).toLocaleString(),
        end_as_date: new Date(event.end).toLocaleString()
      }))
    });
    
    return events;
  }, [getCalendarEvents, userTimezone]);

  // Handle event click
  const handleEventClick = useCallback((clickInfo: any) => {
    const event = clickInfo.event;
    const job = event.extendedProps;
    
    console.log('📅 Calendar event clicked:', {
      title: event.title,
      utc_start: event.start,
      utc_end: event.end,
      local_start: job.localStart,
      local_end: job.localEnd,
      timezone: userTimezone
    });

    // TODO: Open job details modal
    alert(`Job: ${event.title}\nLocal Time: ${format(new Date(job.localStart), 'PPp')}`);
  }, [userTimezone]);

  // Handle date selection
  const handleDateSelect = useCallback((selectInfo: any) => {
    console.log('📅 Date selected:', {
      start: selectInfo.start,
      end: selectInfo.end,
      timezone: userTimezone
    });
    
    // TODO: Open create job modal with pre-filled date
    alert(`Create job for ${format(selectInfo.start, 'PPP')}`);
  }, [userTimezone]);

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
            eventMouseEnter={(mouseInfo) => {
              const job = mouseInfo.event.extendedProps;
              console.log('🎯 Event hover:', {
                title: mouseInfo.event.title,
                customer: job.customer_name,
                status: job.status,
                priority: job.priority
              });
            }}
            eventDidMount={(info) => {
              const job = info.event.extendedProps;
              
              // Log what FullCalendar received and how it's interpreting times
              console.log('🎨 FullCalendar mounted event:', {
                title: info.event.title,
                fullcalendar_start: info.event.start?.toISOString(),
                fullcalendar_end: info.event.end?.toISOString(),
                fullcalendar_start_display: info.event.start?.toLocaleString(),
                fullcalendar_end_display: info.event.end?.toLocaleString(),
                timezone_setting: userTimezone,
                original_local_start: job.localStart?.toLocaleString(),
                original_local_end: job.localEnd?.toLocaleString()
              });
              
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
                  <p>Local: {job.local_start.toLocaleString()} → {job.local_end.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}