import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RRule } from 'rrule';

interface RRuleBuilderProps {
  rrule: string;
  onChange: (rrule: string) => void;
  startDate: string;
  className?: string;
}

interface RRuleConfig {
  freq: 'WEEKLY' | 'MONTHLY';
  interval: number;
  byweekday?: number[];
  bymonthday?: number;
  monthlyType?: 'day' | 'weekday';
  bysetpos?: number;
  monthlyWeekday?: number;
  until?: string;
}

export function RRuleBuilder({ rrule, onChange, startDate, className }: RRuleBuilderProps) {
  const parseRRule = (rruleString: string): RRuleConfig => {
    try {
      if (!rruleString || rruleString === '') {
        return { freq: 'WEEKLY', interval: 1 };
      }
      
      const rule = RRule.fromString(rruleString);
      const options = rule.options;
      
      // Use proper RRule frequency constants
      let freq: 'WEEKLY' | 'MONTHLY';
      if (options.freq === RRule.WEEKLY) {
        freq = 'WEEKLY';
      } else if (options.freq === RRule.MONTHLY) {
        freq = 'MONTHLY';
      } else {
        // Default to WEEKLY for any other frequency (including DAILY)
        freq = 'WEEKLY';
      }
      
      const config: RRuleConfig = {
        freq,
        interval: options.interval || 1,
        byweekday: options.byweekday as number[] | undefined,
        bymonthday: options.bymonthday?.[0],
        until: options.until?.toISOString().split('T')[0]
      };
      
      // Detect monthly pattern type
      if (config.freq === 'MONTHLY') {
        if (options.bysetpos && options.byweekday) {
          config.monthlyType = 'weekday';
          config.bysetpos = Array.isArray(options.bysetpos) ? options.bysetpos[0] : options.bysetpos;
          config.monthlyWeekday = Array.isArray(options.byweekday) ? options.byweekday[0] : options.byweekday;
        } else {
          config.monthlyType = 'day';
        }
      }
      
      return config;
    } catch {
      return { freq: 'WEEKLY', interval: 1 };
    }
  };

  const buildRRule = (config: RRuleConfig): string => {
    let rruleParts = [`FREQ=${config.freq}`, `INTERVAL=${config.interval}`];
    
    if (config.freq === 'WEEKLY' && config.byweekday && config.byweekday.length > 0) {
      const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
      const weekdays = config.byweekday.map(day => days[day]).join(',');
      rruleParts.push(`BYDAY=${weekdays}`);
    }
    
    if (config.freq === 'MONTHLY') {
      if (config.monthlyType === 'weekday' && config.monthlyWeekday !== undefined && config.bysetpos !== undefined) {
        const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
        rruleParts.push(`BYDAY=${days[config.monthlyWeekday]}`);
        rruleParts.push(`BYSETPOS=${config.bysetpos}`);
      } else if (config.monthlyType === 'day' && config.bymonthday) {
        rruleParts.push(`BYMONTHDAY=${config.bymonthday}`);
      }
    }
    
    if (config.until) {
      const untilDate = new Date(config.until);
      untilDate.setHours(23, 59, 59);
      rruleParts.push(`UNTIL=${untilDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    }
    
    return rruleParts.join(';');
  };

  const config = parseRRule(rrule);

  const updateConfig = (updates: Partial<RRuleConfig>) => {
    let newConfig = { ...config, ...updates };
    
    // Clear incompatible fields when frequency changes
    if (updates.freq && updates.freq !== config.freq) {
      if (updates.freq === 'WEEKLY') {
        // Clear monthly-specific fields
        newConfig = {
          ...newConfig,
          bymonthday: undefined,
          monthlyType: undefined,
          bysetpos: undefined,
          monthlyWeekday: undefined,
        };
      } else if (updates.freq === 'MONTHLY') {
        // Clear weekly-specific fields and set default monthly type
        newConfig = {
          ...newConfig,
          byweekday: undefined,
          monthlyType: 'day',
          bymonthday: 1, // Set default day of month
        };
      }
    }

    // Set default values for monthly weekday pattern
    if (updates.monthlyType === 'weekday' && newConfig.freq === 'MONTHLY') {
      if (!newConfig.bysetpos) newConfig.bysetpos = 1;
      if (newConfig.monthlyWeekday === undefined) newConfig.monthlyWeekday = 0;
      // Clear day-of-month when switching to weekday pattern
      newConfig.bymonthday = undefined;
    }

    // Set default day when switching to day pattern
    if (updates.monthlyType === 'day' && newConfig.freq === 'MONTHLY') {
      if (!newConfig.bymonthday) newConfig.bymonthday = 1;
      // Clear weekday pattern fields
      newConfig.bysetpos = undefined;
      newConfig.monthlyWeekday = undefined;
    }
    
    onChange(buildRRule(newConfig));
  };

  // Memoized preview text generation to prevent expensive recalculations
  const previewText = useMemo((): string => {
    try {
      if (!rrule || !startDate) return 'No recurrence pattern set';
      
      const rule = RRule.fromString(rrule);
      const start = new Date(startDate);
      
      // Use rule.between() with a limited range instead of rule.all()
      // This prevents generating infinite occurrences which causes freezing
      const endRange = new Date(start);
      endRange.setMonth(endRange.getMonth() + 6); // Look ahead 6 months max
      
      const occurrences = rule.between(start, endRange, true).slice(0, 3);
      
      if (occurrences.length === 0) return 'No upcoming occurrences';
      
      return `Next occurrences: ${occurrences.map(date => 
        date.toLocaleDateString('en-US', { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        })
      ).join(', ')}`;
    } catch (error) {
      console.warn('Error generating RRULE preview:', error);
      return 'Invalid recurrence pattern';
    }
  }, [rrule, startDate]);

  const weekdayOptions = [
    { value: 0, label: 'Monday' },
    { value: 1, label: 'Tuesday' },
    { value: 2, label: 'Wednesday' },
    { value: 3, label: 'Thursday' },
    { value: 4, label: 'Friday' },
    { value: 5, label: 'Saturday' },
    { value: 6, label: 'Sunday' },
  ];

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recurrence Pattern</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select 
              value={config.freq} 
              onValueChange={(value: 'WEEKLY' | 'MONTHLY') => updateConfig({ freq: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                      </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Every</Label>
            <Input
              type="number"
              min="1"
              max="12"
              value={config.interval}
              onChange={(e) => updateConfig({ interval: parseInt(e.target.value) || 1 })}
              placeholder="1"
            />
          </div>
        </div>

        {config.freq === 'WEEKLY' && (
          <div className="space-y-2">
            <Label>Days of the week</Label>
            <div className="grid grid-cols-4 gap-2">
              {weekdayOptions.map((day) => (
                <div key={day.value} className="flex items-center space-x-2">
                  <Switch
                    checked={config.byweekday?.includes(day.value) || false}
                    onCheckedChange={(checked) => {
                      const currentDays = config.byweekday || [];
                      const newDays = checked 
                        ? [...currentDays, day.value]
                        : currentDays.filter(d => d !== day.value);
                      updateConfig({ byweekday: newDays.length > 0 ? newDays : undefined });
                    }}
                  />
                  <Label className="text-sm">{day.label.slice(0, 3)}</Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {config.freq === 'MONTHLY' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Monthly pattern</Label>
              <Select 
                value={config.monthlyType || 'day'} 
                onValueChange={(value: 'day' | 'weekday') => updateConfig({ monthlyType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day of month</SelectItem>
                  <SelectItem value="weekday">Nth weekday of month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {config.monthlyType === 'day' && (
              <div className="space-y-2">
                <Label>Day of month</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={config.bymonthday || ''}
                  onChange={(e) => updateConfig({ bymonthday: parseInt(e.target.value) || undefined })}
                  placeholder="Day of month"
                />
              </div>
            )}

            {config.monthlyType === 'weekday' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select 
                    value={config.bysetpos?.toString() || ''} 
                    onValueChange={(value) => updateConfig({ bysetpos: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">First</SelectItem>
                      <SelectItem value="2">Second</SelectItem>
                      <SelectItem value="3">Third</SelectItem>
                      <SelectItem value="4">Fourth</SelectItem>
                      <SelectItem value="-1">Last</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Day of week</Label>
                  <Select 
                    value={config.monthlyWeekday?.toString() || ''} 
                    onValueChange={(value) => updateConfig({ monthlyWeekday: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {weekdayOptions.map((day) => (
                        <SelectItem key={day.value} value={day.value.toString()}>
                          {day.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>End date (optional)</Label>
          <Input
            type="date"
            value={config.until || ''}
            onChange={(e) => updateConfig({ until: e.target.value === '' ? undefined : e.target.value })}
          />
        </div>

        <div className="p-3 bg-muted rounded-md">
          <Label className="text-sm font-medium">Preview</Label>
          <p className="text-sm text-muted-foreground mt-1">{previewText}</p>
        </div>
      </CardContent>
    </Card>
  );
}