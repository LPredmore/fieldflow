import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
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
  const { jobs, loading } = useCalendarJobs() as any;
  const userTimezone = useUserTimezone();
  const calendarRef = useRef<FullCalendar>(null);
  const [calendarView, setCalendarView] = useState({
    view: 'timeGridWeek',
    date: new Date()
  });

  // Debug component re-renders
  useEffect(() => {
    console.log('🔄 EnhancedCalendar re-rendered:', {
      jobCount: jobs.length,
      loading,
      calendarView,
      timestamp: new Date().toISOString()
    });
  });

  // Convert jobs to calendar events with stability to prevent view resets
  const calendarEvents = useMemo(() => {
    console.log('🎨 Converting jobs to calendar events:', {
      jobCount: jobs.length,
      timestamp: new Date().toISOString()
    });
    
    const events = jobs.map((job: any) => ({
      id: job.id,
      title: job.title,
      start: new Date(job.start_at),
      end: new Date(job.end_at),
      backgroundColor: job.status === 'completed' ? '#10b981' : 
                      job.status === 'cancelled' ? '#ef4444' :
                      job.priority === 'urgent' ? '#f59e0b' : '#3b82f6',
      borderColor: 'transparent',
      extendedProps: {
        status: job.status,
        priority: job.priority,
        customer_name: job.customer_name,
        series_id: job.series_id,
        localStart: job.local_start,
        localEnd: job.local_end,
      },
    }));
    
    console.log('🎨 Generated calendar events:', {
      eventCount: events.length,
      sampleEvents: events.slice(0, 2).map(e => ({
        id: e.id,
        title: e.title,
        start: e.start.toISOString(),
        end: e.end.toISOString()
      }))
    });
    
    return events;
  }, [jobs]);

  // Handle navigation without triggering data refetch loops
  const handleNavigation = useCallback((direction: 'prev' | 'next' | 'today') => {
    console.log(`🧭 Navigation: ${direction}`);
    
    const api = calendarRef.current?.getApi();
    if (!api) return;
    
    switch (direction) {
      case 'prev':
        api.prev();
        break;
      case 'next':
        api.next();
        break;
      case 'today':
        api.today();
        break;
    }
    
    // Update our internal view state
    setTimeout(() => {
      const currentView = api.view;
      setCalendarView({
        view: currentView.type,
        date: currentView.currentStart
      });
      
      console.log('📅 Calendar view updated:', {
        view: currentView.type,
        title: currentView.title,
        start: currentView.currentStart.toISOString(),
        end: currentView.currentEnd.toISOString()
      });
    }, 100);
  }, []);

  // Handle view changes (week/month/day)
  const handleViewChange = useCallback((viewType: string) => {
    console.log(`👁️ View change: ${viewType}`);
    
    const api = calendarRef.current?.getApi();
    if (!api) return;
    
    api.changeView(viewType);
    
    setTimeout(() => {
      const currentView = api.view;
      setCalendarView({
        view: currentView.type,
        date: currentView.currentStart
      });
      
      console.log('📅 Calendar view changed:', {
        view: currentView.type,
        title: currentView.title,
        start: currentView.currentStart.toISOString(),
        end: currentView.currentEnd.toISOString()
      });
    }, 100);
  }, []);

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
            key="stable-calendar"
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            timeZone={userTimezone}
            headerToolbar={{
              left: 'customPrev,customNext,customToday',
              center: 'title',
              right: 'customMonth,customWeek,customDay'
            }}
            height="600px"
            events={calendarEvents}
            selectable={true}
            selectMirror={true}
            editable={false}
            eventClick={handleEventClick}
            select={handleDateSelect}
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
            // Track navigation events to prevent conflicts
            viewDidMount={(info) => {
              console.log('🏗️ FullCalendar view mounted:', {
                viewType: info.view.type,
                title: info.view.title,
                start: info.view.currentStart?.toISOString(),
                end: info.view.currentEnd?.toISOString(),
                timestamp: new Date().toISOString()
              });
            }}
            // Add navigation event handlers
            // Custom navigation buttons that don't trigger data refetch
            customButtons={{
              customPrev: {
                text: '‹',
                click: () => handleNavigation('prev')
              },
              customNext: {
                text: '›',
                click: () => handleNavigation('next')
              },
              customToday: {
                text: 'Today',
                click: () => handleNavigation('today')
              },
              customMonth: {
                text: 'Month',
                click: () => handleViewChange('dayGridMonth')
              },
              customWeek: {
                text: 'Week',
                click: () => handleViewChange('timeGridWeek')
              },
              customDay: {
                text: 'Day',
                click: () => handleViewChange('timeGridDay')
              }
            }}
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