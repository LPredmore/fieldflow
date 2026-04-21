import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface SendSmsArgs {
  to: string;
  body: string;
  triggered_by:
    | "job_reminder"
    | "on_the_way"
    | "quote_sent"
    | "invoice_sent"
    | "invoice_overdue"
    | "test"
    | "first_contact"
    | "manual";
  related_entity_type?: "job_occurrence" | "invoice" | "quote" | null;
  related_entity_id?: string | null;
  bypass_business_hours?: boolean;
  skip_opt_in_prefix?: boolean;
  silent?: boolean; // suppress toasts on failure (for batch/auto-trigger flows)
}

export interface SendSmsResult {
  ok: boolean;
  message_id?: string;
  twilio_sid?: string;
  error?: string;
  message?: string;
}

const ERROR_LABELS: Record<string, string> = {
  sms_not_configured: "SMS isn't set up yet. Visit Settings → Notifications → SMS.",
  sms_disabled: "SMS sending is disabled in your settings.",
  no_from_number: "No Twilio phone number selected.",
  no_valid_phone: "That phone number isn't valid.",
  recipient_opted_out: "This recipient has opted out of SMS.",
  outside_business_hours: "Outside business hours (7am–9pm tenant local).",
  rate_limit: "Hourly SMS rate limit reached.",
  daily_cap_exceeded: "Daily SMS send cap reached.",
  twilio_not_connected: "Twilio isn't connected. Complete the wizard first.",
  twilio_error: "Twilio rejected the message.",
};

// Events that are owned by the centralized server-side dispatcher.
// They MUST go through their dedicated edge function (dispatch-entity-sms,
// quote-followup-worker, invoice-overdue-worker, etc.) so that per-channel
// idempotency (notification_dispatches) is enforced. Calling send-sms
// directly for these would bypass the ledger and risk double-sends.
const DISPATCHER_OWNED_EVENTS = new Set<SendSmsArgs["triggered_by"]>([
  "quote_sent",
  "invoice_sent",
  "invoice_overdue",
  "on_the_way",
  "job_reminder",
]);

export function useSendSms() {
  const [sending, setSending] = useState(false);

  const send = useCallback(async (args: SendSmsArgs): Promise<SendSmsResult> => {
    if (DISPATCHER_OWNED_EVENTS.has(args.triggered_by)) {
      const message = `useSendSms cannot send '${args.triggered_by}' — it is owned by the server-side dispatcher. Call the appropriate edge function (e.g. dispatch-entity-sms) instead.`;
      console.error(message);
      if (!args.silent) {
        toast({
          title: "SMS not sent",
          description: "This message type is sent automatically by the system.",
          variant: "destructive",
        });
      }
      return { ok: false, error: "dispatcher_owned_event", message };
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          to: args.to,
          body: args.body,
          triggered_by: args.triggered_by,
          related_entity_type: args.related_entity_type ?? null,
          related_entity_id: args.related_entity_id ?? null,
          bypass_business_hours: args.bypass_business_hours ?? false,
          skip_opt_in_prefix: args.skip_opt_in_prefix ?? false,
        },
      });
      if (error) {
        if (!args.silent) {
          toast({
            title: "SMS failed",
            description: error.message,
            variant: "destructive",
          });
        }
        return { ok: false, error: "request_failed", message: error.message };
      }
      const result = data as SendSmsResult;
      if (!result.ok) {
        const label = result.error ? ERROR_LABELS[result.error] ?? result.message ?? result.error : "Unknown error";
        if (!args.silent) {
          toast({
            title: "SMS not sent",
            description: label,
            variant: "destructive",
          });
        }
        return result;
      }
      return result;
    } finally {
      setSending(false);
    }
  }, []);

  return { send, sending };
}
