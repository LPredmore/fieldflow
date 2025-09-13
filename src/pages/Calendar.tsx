import { useState, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useJobs } from '@/hooks/useJobs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Grid, List } from 'lucide-react';

const Calendar = () => {
  const { jobs } = useJobs();
  const [calendarView, setCalendarView] = useState<'dayGridMonth' | 'timeGridWeek'>('dayGridMonth');

  // Transform jobs into calendar events
  const calendarEvents = useMemo(() => {
    return jobs.map((job) => {
      let startDate = job.scheduled_date;
      let endDate = job.complete_date || job.scheduled_date;
      
      // If the job spans multiple days, show it as a multi-day event
      const isMultiDay = startDate !== endDate;
      
      // Determine color based on status
      let backgroundColor = '#3b82f6'; // blue for scheduled
      let borderColor = '#3b82f6';
      
      switch (job.status) {
        case 'in_progress':
          backgroundColor = '#f59e0b'; // amber
          borderColor = '#f59e0b';
          break;
        case 'completed':
          backgroundColor = '#10b981'; // green
          borderColor = '#10b981';
          break;
        case 'cancelled':
          backgroundColor = '#ef4444'; // red
          borderColor = '#ef4444';
          break;
      }

      return {
        id: job.id,
        title: job.title,
        start: startDate,
        end: isMultiDay ? endDate : undefined,
        allDay: true,
        backgroundColor,
        borderColor,
        extendedProps: {
          status: job.status,
          customerName: job.customer_name,
          priority: job.priority,
          estimatedCost: job.estimated_cost,
          actualCost: job.actual_cost,
          description: job.description
        }
      };
    });
  }, [jobs]);

  const handleEventClick = (eventInfo: any) => {
    const event = eventInfo.event;
    const props = event.extendedProps;
    
    alert(`Job: ${event.title}\nCustomer: ${props.customerName}\nStatus: ${props.status}\nPriority: ${props.priority}\n${props.description ? `Description: ${props.description}` : ''}`);
  };

  return (
    <div className="bg-gradient-to-br from-background to-muted p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <CalendarIcon className="h-8 w-8" />
              Schedule Calendar
            </h1>
            <p className="text-muted-foreground">
              View and manage job schedules across time
            </p>
          </div>
          
          {/* View Controls */}
          <div className="flex gap-2">
            <Button
              variant={calendarView === 'dayGridMonth' ? 'default' : 'outline'}
              onClick={() => setCalendarView('dayGridMonth')}
              className="flex items-center gap-2"
            >
              <Grid className="h-4 w-4" />
              Month
            </Button>
            <Button
              variant={calendarView === 'timeGridWeek' ? 'default' : 'outline'}
              onClick={() => setCalendarView('timeGridWeek')}
              className="flex items-center gap-2"
            >
              <List className="h-4 w-4" />
              Week
            </Button>
          </div>
        </div>

        {/* Calendar Card */}
        <Card className="shadow-material-md">
          <CardHeader>
            <CardTitle>Job Schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-6">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView={calendarView}
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: ''
                }}
                events={calendarEvents}
                eventClick={handleEventClick}
                height="auto"
                dayMaxEventRows={3}
                eventDisplay="block"
                displayEventTime={false}
                eventDidMount={(info) => {
                  // Add tooltip
                  info.el.title = `${info.event.title} - ${info.event.extendedProps.customerName}`;
                }}
                aspectRatio={1.8}
              />
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="shadow-material-sm">
          <CardHeader>
            <CardTitle className="text-lg">Status Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span className="text-sm">Scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-amber-500 rounded"></div>
                <span className="text-sm">In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span className="text-sm">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span className="text-sm">Cancelled</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Calendar;