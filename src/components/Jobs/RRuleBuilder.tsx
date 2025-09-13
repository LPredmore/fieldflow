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
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  byweekday?: number[];
  bymonthday?: number;
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
      
      return {
        freq: ['DAILY', 'WEEKLY', 'MONTHLY'][options.freq] as 'DAILY' | 'WEEKLY' | 'MONTHLY',
        interval: options.interval || 1,
        byweekday: options.byweekday as number[] | undefined,
        bymonthday: options.bymonthday?.[0],
        until: options.until?.toISOString().split('T')[0]
      };
    } catch {
      return { freq: 'WEEKLY', interval: 1 };
    }
  };

  const buildRRule = (config: RRuleConfig): string => {
    let rruleParts = [`FREQ=${config.freq}`, `INTERVAL=${config.interval}`];
    
    if (config.byweekday && config.byweekday.length > 0) {
      const days = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
      const weekdays = config.byweekday.map(day => days[day]).join(',');
      rruleParts.push(`BYDAY=${weekdays}`);
    }
    
    if (config.bymonthday) {
      rruleParts.push(`BYMONTHDAY=${config.bymonthday}`);
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
    const newConfig = { ...config, ...updates };
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
              onValueChange={(value: 'DAILY' | 'WEEKLY' | 'MONTHLY') => updateConfig({ freq: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Daily</SelectItem>
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

        <div className="space-y-2">
          <Label>End date (optional)</Label>
          <Input
            type="date"
            value={config.until || ''}
            onChange={(e) => updateConfig({ until: e.target.value || undefined })}
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