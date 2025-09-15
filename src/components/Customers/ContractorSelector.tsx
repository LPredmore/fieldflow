import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormControl } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { User, Shield } from "lucide-react";

interface ContractorOption {
  id: string;
  full_name: string;
  role: 'business_admin' | 'contractor';
}

interface ContractorSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function ContractorSelector({ value, onValueChange, disabled }: ContractorSelectorProps) {
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, tenantId } = useAuth();

  useEffect(() => {
    const fetchContractors = async () => {
      if (!user || !tenantId) return;

      try {
        setLoading(true);
        
        // Fetch admin and all contractors in the tenant
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .or(`id.eq.${tenantId},parent_admin_id.eq.${tenantId}`)
          .order('role', { ascending: true })
          .order('full_name', { ascending: true });

        if (error) {
          console.error('Error fetching contractors:', error);
          return;
        }

        setContractors(data || []);
      } catch (error) {
        console.error('Error fetching contractors:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchContractors();
  }, [user, tenantId]);

  if (loading) {
    return (
      <Select disabled>
        <FormControl>
          <SelectTrigger disabled>
            <SelectValue placeholder="Loading..." />
          </SelectTrigger>
        </FormControl>
      </Select>
    );
  }

  const handleValueChange = (newValue: string) => {
    // Convert "unassigned" to empty string for the parent component
    onValueChange(newValue === "unassigned" ? "" : newValue);
  };

  // Convert empty/null value to "unassigned" for the select component
  const selectValue = value ? value : "unassigned";

  return (
    <Select onValueChange={handleValueChange} value={selectValue} disabled={disabled}>
      <FormControl>
        <SelectTrigger>
          <SelectValue placeholder="Select assigned contractor" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value="unassigned">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Unassigned</span>
          </div>
        </SelectItem>
        {contractors.map((contractor) => (
          <SelectItem key={contractor.id} value={contractor.id}>
            <div className="flex items-center gap-2">
              {contractor.role === 'business_admin' ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span>
                {contractor.full_name || 'Unnamed User'}
                {contractor.role === 'business_admin' && ' (Admin)'}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}