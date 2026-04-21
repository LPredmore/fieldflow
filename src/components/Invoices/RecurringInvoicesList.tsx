import { useState } from 'react';
import { format } from 'date-fns';
import {
  MoreVertical,
  Play,
  Pause,
  Edit,
  Trash2,
  Zap,
  Repeat,
  Plus,
} from 'lucide-react';
import { RRule } from 'rrule';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useInvoiceSchedules, InvoiceSchedule } from '@/hooks/useInvoiceSchedules';
import { RecurringInvoiceScheduleForm } from './RecurringInvoiceScheduleForm';

function humanizeRRule(rule: string): string {
  try {
    return RRule.fromString(rule).toText();
  } catch {
    return rule;
  }
}

export function RecurringInvoicesList() {
  const {
    schedules,
    loading,
    createSchedule,
    updateSchedule,
    setStatus,
    deleteSchedule,
    generateNow,
    isGenerating,
  } = useInvoiceSchedules();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceSchedule | null>(null);
  const [deleting, setDeleting] = useState<InvoiceSchedule | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleGenerate = async (id: string) => {
    setGeneratingId(id);
    try {
      await generateNow(id);
    } finally {
      setGeneratingId(null);
    }
  };

  const statusBadge = (status: InvoiceSchedule['status']) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-success/10 text-success border-success/20">Active</Badge>;
      case 'paused':
        return <Badge className="bg-warning/10 text-warning border-warning/20">Paused</Badge>;
      case 'ended':
        return <Badge variant="outline">Ended</Badge>;
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Recurring billing schedules
          </h2>
          <p className="text-sm text-muted-foreground">
            Automate invoices for maintenance contracts and recurring services.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New schedule
        </Button>
      </div>

      {loading ? (
        <Card><CardContent className="p-6 space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </CardContent></Card>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Repeat className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No recurring schedules yet</h3>
            <p className="text-muted-foreground mb-4">
              Create a schedule to auto-generate invoices for maintenance contracts.
            </p>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              New schedule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Next issue</TableHead>
                  <TableHead>Last issued</TableHead>
                  <TableHead>Auto-send</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.customer_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {humanizeRRule(s.rrule)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {s.billing_mode === 'flat_fee' ? 'Flat fee' : 'Per-visit'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.next_issue_at ? format(new Date(s.next_issue_at), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.last_issued_at ? format(new Date(s.last_issued_at), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      {s.auto_send ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20">On</Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditing(s); setFormOpen(true); }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleGenerate(s.id)}
                            disabled={isGenerating || s.status !== 'active'}
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            {generatingId === s.id ? 'Generating…' : 'Generate now'}
                          </DropdownMenuItem>
                          {s.status === 'active' ? (
                            <DropdownMenuItem onClick={() => setStatus({ id: s.id, status: 'paused' })}>
                              <Pause className="h-4 w-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          ) : s.status === 'paused' ? (
                            <DropdownMenuItem onClick={() => setStatus({ id: s.id, status: 'active' })}>
                              <Play className="h-4 w-4 mr-2" />
                              Resume
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onClick={() => setDeleting(s)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <RecurringInvoiceScheduleForm
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        onSubmit={async (data) => {
          if (editing) {
            await updateSchedule({ id: editing.id, ...data });
          } else {
            await createSchedule(data);
          }
        }}
        schedule={editing}
        title={editing ? 'Edit recurring schedule' : 'New recurring schedule'}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete schedule</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{deleting?.name}"? Already-issued invoices remain — only the recurrence rule is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleting) {
                  await deleteSchedule(deleting.id);
                  setDeleting(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
