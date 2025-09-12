import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface PermissionCheckboxProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function PermissionCheckbox({ 
  label, 
  description, 
  checked, 
  disabled = false,
  loading = false,
  onCheckedChange 
}: PermissionCheckboxProps) {
  return (
    <div className="flex items-start space-x-3 py-2">
      <div className="flex items-center space-x-2 mt-0.5">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Checkbox
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            id={`permission-${label.toLowerCase().replace(/\s+/g, '-')}`}
          />
        )}
      </div>
      <div className="space-y-1">
        <Label
          htmlFor={`permission-${label.toLowerCase().replace(/\s+/g, '-')}`}
          className="text-sm font-medium cursor-pointer"
        >
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}