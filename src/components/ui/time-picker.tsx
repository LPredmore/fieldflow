import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Generate time component options
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const hour = i + 1;
  return { value: hour.toString(), label: hour.toString() };
});

const MINUTE_OPTIONS = [
  { value: "00", label: "00" },
  { value: "15", label: "15" },
  { value: "30", label: "30" },
  { value: "45", label: "45" },
];

const PERIOD_OPTIONS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

interface TimePickerProps {
  value?: string; // HH:mm format (24-hour)
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Convert 12-hour format to 24-hour format
const convertTo24Hour = (hour: string, period: string): string => {
  let h = parseInt(hour);
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h.toString().padStart(2, "0");
};

// Convert 24-hour format to 12-hour format
const convertTo12Hour = (hour24: string): { hour: string; period: string } => {
  let h = parseInt(hour24);
  const period = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  if (h > 12) h -= 12;
  return { hour: h.toString(), period };
};

// Parse time string (HH:mm) into components
const parseTime = (timeStr: string) => {
  if (!timeStr || !timeStr.includes(":")) {
    return { hour: "", minute: "00", period: "AM" };
  }
  
  const [hourPart, minutePart] = timeStr.split(":");
  const { hour, period } = convertTo12Hour(hourPart);
  
  return {
    hour,
    minute: minutePart || "00",
    period,
  };
};

export const TimePicker = React.forwardRef<
  HTMLDivElement,
  TimePickerProps
>(({ value, onChange, placeholder = "Select time", disabled, ...props }, ref) => {
  const { hour, minute, period } = parseTime(value || "");

  const handleTimeChange = (newHour: string, newMinute: string, newPeriod: string) => {
    if (newHour && newMinute && newPeriod) {
      const hour24 = convertTo24Hour(newHour, newPeriod);
      const timeString = `${hour24}:${newMinute}`;
      onChange?.(timeString);
    }
  };

  const handleHourChange = (newHour: string) => {
    handleTimeChange(newHour, minute, period);
  };

  const handleMinuteChange = (newMinute: string) => {
    handleTimeChange(hour, newMinute, period);
  };

  const handlePeriodChange = (newPeriod: string) => {
    handleTimeChange(hour, minute, newPeriod);
  };

  return (
    <div ref={ref} className="flex gap-2" {...props}>
      {/* Hour Select */}
      <Select value={hour} onValueChange={handleHourChange} disabled={disabled}>
        <SelectTrigger className="w-20">
          <SelectValue placeholder="Hr" />
        </SelectTrigger>
        <SelectContent>
          {HOUR_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="flex items-center text-muted-foreground">:</span>

      {/* Minute Select */}
      <Select value={minute} onValueChange={handleMinuteChange} disabled={disabled}>
        <SelectTrigger className="w-20">
          <SelectValue placeholder="Min" />
        </SelectTrigger>
        <SelectContent>
          {MINUTE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* AM/PM Select */}
      <Select value={period} onValueChange={handlePeriodChange} disabled={disabled}>
        <SelectTrigger className="w-20">
          <SelectValue placeholder="AM" />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});

TimePicker.displayName = "TimePicker";