// src/components/Calendar/EnhancedCalendar.tsx
// REQUIREMENTS:
//   npm i @fullcalendar/luxon3 luxon
//
// Fixes timezone display by:
//  - Adding FullCalendar's Luxon plugin (for named IANA zones)
//  - Passing Date objects (constructed from UTC ISO strings) to FullCalendar
//  - Setting timeZone to the browser's IANA string from useUserTimezone()

import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
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
import { Calendar as CalendarIcon, Clock, MapPin, User, Bug, RefreshCw, Navigation } from 'lucide-react';
import { format } from 'date-fns';

export function EnhancedCalendar() {
  const { jobs, loading, setRange } = useCalendarJobs() as any;
  const userTimezone = useUserTimezone();
  const calendarRef = useRef<FullCalendar>(null);
  
  // Controlled navigation state
  const [currentView, setCurrentView] = useState<string>('timeGridWeek');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [navigationInProgress, setNavigationInProgress] = useState(false);
  
  // Advanced debugging state
  const [debugInfo, setDebugInfo] = useState({
    renderCount: 0,
    lastAPICall: '',
    eventValidationErrors: [] as string[],
    domUpdateCount: 0,
    lastNavigationTime: '',
  });
  
  // Event Validation Pipeline
  const validateEvents = useCallback((events: any[]) => {
    const errors: string[] = [];
    const validEvents: any[] = [];
    
    events.forEach((event, index) => {
      // Check required fields
      if (!event.id) errors.push(`Event ${index}: Missing id`);
      if (!event.title) errors.push(`Event ${index}: Missing title`);
      if (!event.start) errors.push(`Event ${index}: Missing start date`);
      if (!event.end) errors.push(`Event ${index}: Missing end date`);
      
      // Validate dates
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      
      if (isNaN(startDate.getTime())) {
        errors.push(`Event ${index}: Invalid start date`);
      }
      if (isNaN(endDate.getTime())) {
        errors.push(`Event ${index}: Invalid end date`);
      }
      if (startDate >= endDate) {
        errors.push(`Event ${index}: Start date after end date`);
      }
      
      if (errors.length === 0 || errors.filter(e => e.includes(`Event ${index}`)).length === 0) {
        validEvents.push(event);
      }
    });
    
    setDebugInfo(prev => ({ ...prev, eventValidationErrors: errors }));
    
    console.log('🔍 Event Validation Results:', {
      totalEvents: events.length,
      validEvents: validEvents.length,
      errors: errors.length,
      errorDetails: errors
    });
    
    return validEvents;
  }, []);

  // Convert to Date objects with validation
  const calendarEvents = useMemo(() => {
    const rawEvents = jobs.map((job: any) => ({
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
    
    return validateEvents(rawEvents);
  }, [jobs, validateEvents]);

  // Create unique key to force FullCalendar re-render
  const eventsKey = `${calendarEvents.length}-${calendarEvents.map(ev => ev.start?.toString() || '').join('-')}`;
  console.log('🔑 FullCalendar key:', eventsKey);

  // Single consolidated navigation effect - this replaces all the conflicting navigation logic
  useEffect(() => {
    if (!calendarRef.current || navigationInProgress) return;
    
    const api = calendarRef.current.getApi();
    
    // Only navigate if we have events or need to set initial view
    if (calendarEvents.length > 0 || !api.view) {
      setNavigationInProgress(true);
      
      let targetDate = currentDate;
      
      // If we have events, navigate to the earliest event
      if (calendarEvents.length > 0) {
        const eventDates = calendarEvents.map(e => new Date(e.start));
        targetDate = new Date(Math.min(...eventDates.map(d => d.getTime())));
        setCurrentDate(targetDate);
      }
      
      console.log('[Navigation] Consolidated navigation to:', {
        targetDate: targetDate.toISOString(),
        currentView,
        eventsCount: calendarEvents.length,
        currentAPIView: api.view?.type,
        currentAPIDate: api.getDate()?.toISOString()
      });
      
      // Sequential API calls to avoid conflicts
      try {
        if (api.view.type !== currentView) {
          api.changeView(currentView);
        }
        api.gotoDate(targetDate);
        
        // Allow some time for the view to update before refetching
        setTimeout(() => {
          api.refetchEvents();
          setNavigationInProgress(false);
          
          console.log('[Navigation] Post-navigation state:', {
            viewType: api.view.type,
            viewTitle: api.view.title,
            currentStart: api.view.currentStart?.toISOString(),
            actualDate: api.getDate()?.toISOString()
          });
          
          setDebugInfo(prev => ({
            ...prev,
            lastAPICall: `Consolidated navigation to ${targetDate.toISOString()} at ${new Date().toISOString()}`,
            domUpdateCount: prev.domUpdateCount + 1
          }));
        }, 150);
        
      } catch (error) {
        console.error('[Navigation] Error during navigation:', error);
        setNavigationInProgress(false);
      }
    }
  }, [calendarEvents.length, currentView, currentDate, navigationInProgress]);
  
  // Track render count for debugging
  useEffect(() => {
    setDebugInfo(prev => ({ ...prev, renderCount: prev.renderCount + 1 }));
  });

  // Update jobs debug info
  useEffect(() => {
    console.log('📋 Jobs received from Supabase:', jobs.map(j => j.start_at));
    console.log('📊 Job Statistics:', {
      total: jobs.length,
      byStatus: jobs.reduce((acc: any, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {}),
      dateRange: jobs.length > 0 ? {
        earliest: Math.min(...jobs.map((j: any) => new Date(j.start_at).getTime())),
        latest: Math.max(...jobs.map((j: any) => new Date(j.start_at).getTime()))
      } : null
    });
  }, [jobs]);

  // Update the data-fetch range whenever the visible dates change
  const handleDatesSet = useCallback(
    (arg: { start: Date; end: Date; view: any }) => {
      const navigationTime = new Date().toISOString();
      console.log('Calendar navigation to:', arg.start.toISOString(), arg.end.toISOString(), arg.view.type);
      console.log('🔍 Enhanced Navigation Debug:', {
        viewType: arg.view.type,
        viewTitle: arg.view.title,
        startDate: arg.start.toISOString(),
        endDate: arg.end.toISOString(),
        calendarAPI: calendarRef.current?.getApi() ? 'Available' : 'Not Available',
        eventCount: calendarEvents.length,
        navigationTime
      });
      
      setDebugInfo(prev => ({
        ...prev,
        lastNavigationTime: navigationTime,
        domUpdateCount: prev.domUpdateCount + 1
      }));
      
      const newRange = { fromISO: arg.start.toISOString(), toISO: arg.end.toISOString() };
      console.log('🔄 Setting new range:', newRange);
      
      // Inclusive start, exclusive end works well with .gte / .lt in the hook
      setRange?.(newRange);
    },
    [setRange, calendarEvents.length]
  );

  const handleEventClick = useCallback((clickInfo: any) => {
    const event = clickInfo.event;
    const job = event.extendedProps;

    console.log('🖱️ Event clicked:', {
      eventId: event.id,
      title: event.title,
      start: event.start?.toISOString(),
      end: event.end?.toISOString(),
      extendedProps: job
    });

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
    console.log('📅 Date selected:', {
      start: selectInfo.start.toISOString(),
      end: selectInfo.end.toISOString(),
      allDay: selectInfo.allDay
    });
    
    // Replace with your "Create Job" modal
    alert(`Create job for ${format(selectInfo.start, 'PPP')}`);
  }, []);

  // Enhanced navigation controls
  const handleChangeView = useCallback((newView: string) => {
    setCurrentView(newView);
    console.log('🔄 View change requested:', newView);
  }, []);
  
  const handleSyncCalendar = useCallback(() => {
    if (jobs.length > 0) {
      const jobDates = jobs.map((j: any) => new Date(j.start_at));
      const earliestJobDate = new Date(Math.min(...jobDates.map(d => d.getTime())));
      setCurrentDate(earliestJobDate);
      console.log('🔄 Manual sync to earliest job date:', earliestJobDate.toISOString());
    }
  }, [jobs]);

  const handleGoToToday = useCallback(() => {
    setCurrentDate(new Date());
    console.log('📅 Going to today');
  }, []);

  const handleTestNavigation = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setCurrentView('timeGridWeek');
    console.log('🧪 Test navigation triggered');
  }, []);

  const handleForceRerender = useCallback(() => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      console.log('🎨 Force rerender triggered');
      // Force a view change to trigger rerender
      const currentViewType = api.view.type;
      api.changeView(currentViewType);
      
      setDebugInfo(prev => ({
        ...prev,
        lastAPICall: `Force render at ${new Date().toISOString()}`,
        domUpdateCount: prev.domUpdateCount + 1
      }));
    }
  }, []);

  const handleManualRefresh = useCallback(() => {
    if (calendarRef.current) {
      const api = calendarRef.current.getApi();
      console.log('🔄 Manual refresh triggered');
      api.refetchEvents();
      
      setDebugInfo(prev => ({
        ...prev,
        lastAPICall: `Manual refresh at ${new Date().toISOString()}`
      }));
    }
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
      {/* Debug Controls */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <Bug className="h-5 w-5" />
              Advanced Calendar Debugging
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleManualRefresh}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Force Refresh Events
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleForceRerender}
                className="flex items-center gap-2"
              >
                <CalendarIcon className="h-4 w-4" />
                Force Rerender
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleTestNavigation}
                className="flex items-center gap-2"
              >
                <Navigation className="h-4 w-4" />
                Test Navigation
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleSyncCalendar}
                className="flex items-center gap-2"
              >
                <Clock className="h-4 w-4" />
                Sync Calendar
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleGoToToday}
                className="flex items-center gap-2"
              >
                <CalendarIcon className="h-4 w-4" />
                Go To Today
              </Button>
              <select 
                value={currentView} 
                onChange={(e) => handleChangeView(e.target.value)}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="timeGridWeek">Week View</option>
                <option value="dayGridMonth">Month View</option>
                <option value="timeGridDay">Day View</option>
              </select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-semibold text-orange-800">Navigation State</h4>
                <p><strong>Current View:</strong> {currentView}</p>
                <p><strong>Current Date:</strong> {currentDate.toDateString()}</p>
                <p><strong>Navigation In Progress:</strong> {navigationInProgress ? 'Yes' : 'No'}</p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold text-orange-800">Event Validation</h4>
                <p><strong>Input Jobs:</strong> {jobs.length}</p>
                <p><strong>Valid Events:</strong> {calendarEvents.length}</p>
                <p><strong>Validation Errors:</strong> {debugInfo.eventValidationErrors.length}</p>
                {debugInfo.eventValidationErrors.length > 0 && (
                  <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-xs">
                    <strong>Errors:</strong>
                    <ul className="list-disc list-inside">
                      {debugInfo.eventValidationErrors.slice(0, 5).map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
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
            key={eventsKey}
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxon3Plugin]}
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
            // Enhanced navigation debugging and handling
            viewDidMount={(info) => {
              console.log('🏔️ Calendar view mounted:', {
                viewType: info.view.type,
                title: info.view.title,
                activeStart: info.view.activeStart?.toISOString(),
                activeEnd: info.view.activeEnd?.toISOString(),
                currentStart: info.view.currentStart?.toISOString(),
                currentEnd: info.view.currentEnd?.toISOString(),
                eventCount: calendarEvents.length,
                timezone: userTimezone
              });
              
              setDebugInfo(prev => ({
                ...prev,
                domUpdateCount: prev.domUpdateCount + 1
              }));
            }}
            // Update data range when the visible window changes
            datesSet={handleDatesSet}
            // Event styling with enhanced debugging
            eventDidMount={(info) => {
              const job = info.event.extendedProps as any;

              console.log('🎨 Event mounted to DOM:', {
                eventId: info.event.id,
                title: info.event.title,
                start: info.event.start?.toISOString(),
                end: info.event.end?.toISOString(),
                domElement: info.el.tagName,
                status: job.status,
                priority: job.priority
              });

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

      {/* Enhanced Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Calendar State</h4>
                  <p><strong>Jobs loaded:</strong> {jobs.length}</p>
                  <p><strong>Valid events:</strong> {calendarEvents.length}</p>
                  <p><strong>User timezone:</strong> {userTimezone || 'local'}</p>
                  <p><strong>Events key:</strong> {eventsKey.substring(0, 50)}...</p>
                  <p><strong>API available:</strong> {calendarRef.current ? 'Yes' : 'No'}</p>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-2">Performance Metrics</h4>
                  <p><strong>Component renders:</strong> {debugInfo.renderCount}</p>
                  <p><strong>DOM updates:</strong> {debugInfo.domUpdateCount}</p>
                  <p><strong>Validation errors:</strong> {debugInfo.eventValidationErrors.length}</p>
                  {debugInfo.lastNavigationTime && (
                    <p><strong>Last navigation:</strong> {new Date(debugInfo.lastNavigationTime).toLocaleTimeString()}</p>
                  )}
                </div>
              </div>
              
              {jobs.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Sample Job Data</h4>
                  {jobs.slice(0, 2).map((job: any) => (
                    <div key={job.id} className="ml-4 p-3 bg-muted rounded mb-2">
                      <p><strong>{job.title}</strong> (ID: {job.id})</p>
                      <p><strong>UTC:</strong> {job.start_at} → {job.end_at}</p>
                      <p><strong>Local:</strong> {job.local_start?.toLocaleString()} → {job.local_end?.toLocaleString()}</p>
                      <p><strong>Status:</strong> {job.status} | <strong>Priority:</strong> {job.priority}</p>
                      <p><strong>Customer:</strong> {job.customer_name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
