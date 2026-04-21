import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";

interface StepStatusProps {
  status: "complete" | "active" | "pending" | "error";
  label?: string;
}

export function SMSStatusBadge({ status, label }: StepStatusProps) {
  if (status === "complete") {
    return (
      <Badge variant="default" className="bg-green-600 hover:bg-green-600 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {label ?? "Complete"}
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        {label ?? "In Progress"}
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        {label ?? "Action Needed"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Circle className="h-3 w-3" />
      {label ?? "Not Started"}
    </Badge>
  );
}
