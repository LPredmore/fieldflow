import { useState } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useSendSms } from "@/hooks/useSendSms";
import { toast } from "@/hooks/use-toast";

interface CustomerSendSmsButtonProps {
  customerName: string;
  phone: string | null | undefined;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
}

export function CustomerSendSmsButton({
  customerName,
  phone,
  variant = "outline",
  size = "sm",
}: CustomerSendSmsButtonProps) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const { send, sending } = useSendSms();

  const disabled = !phone;

  const handleSend = async () => {
    if (!phone || !body.trim()) return;
    const result = await send({
      to: phone,
      body: body.trim(),
      triggered_by: "manual",
      bypass_business_hours: true,
    });
    if (result.ok) {
      toast({ title: "SMS sent", description: `Message sent to ${customerName}.` });
      setBody("");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} title={disabled ? "No phone number on file" : undefined}>
          <MessageSquare className="h-4 w-4" />
          {size !== "icon" && <span className="ml-2">Send SMS</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send SMS to {customerName}</DialogTitle>
          <DialogDescription>
            Sending to <span className="font-mono">{phone}</span>. The first message to a new
            recipient will include an opt-out disclosure.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="sms-body">Message</Label>
          <Textarea
            id="sms-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hi, this is a quick update about your service…"
            maxLength={1500}
            rows={5}
          />
          <p className="text-xs text-muted-foreground text-right">{body.length} / 1500</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!body.trim() || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
