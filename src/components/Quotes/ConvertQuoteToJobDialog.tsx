import { useState, useMemo } from "react";
import { format, addDays } from "date-fns";
import { CalendarIcon, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProfiles } from "@/hooks/useProfiles";
import type { Database } from "@/integrations/supabase/types";

type ServiceType = Database["public"]["Enums"]["job_service_type"];
type Priority = Database["public"]["Enums"]["job_priority"];

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "hvac", label: "HVAC" },
  { value: "cleaning", label: "Cleaning" },
  { value: "landscaping", label: "Landscaping" },
  { value: "general_maintenance", label: "General Maintenance" },
  { value: "other", label: "Other" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export interface ConvertQuoteFormValues {
  start_date: string; // yyyy-MM-dd
  local_start_time: string; // HH:mm
  duration_minutes: number;
  service_type: ServiceType;
  priority: Priority;
  assigned_to_user_id: string | null;
}

interface QuoteSummary {
  id: string;
  quote_number: string;
  title: string;
  customer_name: string;
  total_amount: number;
  estimated_start_date?: string | null;
  service_type?: ServiceType | null;
  is_emergency?: boolean | null;
}

interface ConvertQuoteToJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: QuoteSummary | null;
  onConfirm: (values: ConvertQuoteFormValues) => void;
  isSubmitting?: boolean;
}

export function ConvertQuoteToJobDialog({
  open,
  onOpenChange,
  quote,
  onConfirm,
  isSubmitting,
}: ConvertQuoteToJobDialogProps) {
  const { profiles } = useProfiles();

  const contractors = useMemo(
    () => profiles.filter((p) => p.role === "contractor" || p.role === "business_admin"),
    [profiles]
  );

  const initialStart = useMemo(() => {
    if (quote?.estimated_start_date) return new Date(quote.estimated_start_date);
    return addDays(new Date(), 1);
  }, [quote?.estimated_start_date]);

  const [startDate, setStartDate] = useState<Date>(initialStart);
  const [localStartTime, setLocalStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [serviceType, setServiceType] = useState<ServiceType>(
    quote?.service_type || "general_maintenance"
  );
  const [priority, setPriority] = useState<Priority>(
    quote?.is_emergency ? "urgent" : "medium"
  );
  const [assignedToUserId, setAssignedToUserId] = useState<string>("unassigned");

  // Reset state when quote changes
  useMemo(() => {
    if (quote) {
      setStartDate(quote.estimated_start_date ? new Date(quote.estimated_start_date) : addDays(new Date(), 1));
      setServiceType(quote.service_type || "general_maintenance");
      setPriority(quote.is_emergency ? "urgent" : "medium");
    }
  }, [quote]);

  const handleConfirm = () => {
    onConfirm({
      start_date: format(startDate, "yyyy-MM-dd"),
      local_start_time: `${localStartTime}:00`,
      duration_minutes: durationMinutes,
      service_type: serviceType,
      priority,
      assigned_to_user_id: assignedToUserId === "unassigned" ? null : assignedToUserId,
    });
  };

  if (!quote) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Convert Quote to Job
          </DialogTitle>
          <DialogDescription>
            Schedule the job created from quote{" "}
            <span className="font-semibold">{quote.quote_number}</span> — {quote.title}.
            All line items will carry over to the job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Schedule */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(d)}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="start-time">Start Time</Label>
              <Input
                id="start-time"
                type="time"
                value={localStartTime}
                onChange={(e) => setLocalStartTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Estimated Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              min={15}
              step={15}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 60)}
            />
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Service Type</Label>
              <Select value={serviceType} onValueChange={(v) => setServiceType(v as ServiceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign To</Label>
            <Select value={assignedToUserId} onValueChange={setAssignedToUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {contractors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name || c.email} {c.role === "business_admin" ? "(Admin)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{quote.customer_name}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Quote Total</span>
              <span className="font-semibold">
                ${Number(quote.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Creating Job..." : "Create Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
