import { useState } from 'react';
import { useJobScheduler, CreateJobData } from '@/hooks/useJobScheduler';
import { useCustomers } from '@/hooks/useCustomers';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Calendar, Clock, User, DollarSign } from 'lucide-react';
import { format } from 'date-fns';

interface CreateJobDialogProps {
  prefilledDate?: string;
  trigger?: React.ReactNode;
}

export function CreateJobDialog({ prefilledDate, trigger }: CreateJobDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateJobData>>({
    date: prefilledDate || format(new Date(), 'yyyy-MM-dd'),
    time: '09:00',
    duration_minutes: 60,
    priority: 'medium',
    is_recurring: false,
    service_type: 'general_maintenance',
  });

  const { createJob, loading } = useJobScheduler();
  const { customers } = useCustomers();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customer_id || !formData.title || !formData.date || !formData.time) {
      return;
    }

    try {
      const selectedCustomer = customers.find(c => c.id === formData.customer_id);
      
      await createJob({
        ...formData,
        customer_name: selectedCustomer?.name || 'Unknown Customer',
      } as CreateJobData);
      
      setOpen(false);
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        time: '09:00',
        duration_minutes: 60,
        priority: 'medium',
        is_recurring: false,
        service_type: 'general_maintenance',
      });
    } catch (error) {
      console.error('Failed to create job:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Job
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Create New Job
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4" />
                <span className="font-medium">Job Details</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Job Title *</Label>
                  <Input
                    id="title"
                    value={formData.title || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter job title"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="customer">Customer *</Label>
                  <Select
                    value={formData.customer_id || ''}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, customer_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(customer => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Job description (optional)"
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" />
                <span className="font-medium">Schedule</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="time">Time *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={formData.duration_minutes || 60}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                    min="15"
                    step="15"
                  />
                </div>

                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority || 'medium'}
                    onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Options */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="font-medium">Additional Options</span>
              </div>
              
              <div>
                <Label htmlFor="estimated_cost">Estimated Cost</Label>
                <Input
                  id="estimated_cost"
                  type="number"
                  step="0.01"
                  value={formData.estimated_cost || ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    estimated_cost: e.target.value ? parseFloat(e.target.value) : undefined 
                  }))}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label htmlFor="service_type">Service Type</Label>
                <Select
                  value={formData.service_type || 'general_maintenance'}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, service_type: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="hvac">HVAC</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="landscaping">Landscaping</SelectItem>
                    <SelectItem value="general_maintenance">General Maintenance</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="recurring"
                  checked={formData.is_recurring || false}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_recurring: checked }))}
                />
                <Label htmlFor="recurring">Recurring Job</Label>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Job'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}