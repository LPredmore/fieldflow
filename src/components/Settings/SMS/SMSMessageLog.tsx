import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPhoneDisplay } from "@/lib/phoneNormalization";
import { Loader2 } from "lucide-react";

interface SmsMessage {
  id: string;
  direction: "outbound" | "inbound";
  to_number_e164: string;
  from_number_e164: string | null;
  body: string;
  status: string;
  triggered_by: string | null;
  created_at: string;
  error_code: string | null;
}

export function SMSMessageLog() {
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("sms_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setMessages((data as SmsMessage[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recent SMS activity</CardTitle>
        <CardDescription>Last 50 messages (inbound + outbound).</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No messages yet.</p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={m.direction === "outbound" ? "secondary" : "outline"}>
                      {m.direction}
                    </Badge>
                    <span className="font-medium">
                      {formatPhoneDisplay(
                        m.direction === "outbound" ? m.to_number_e164 : m.from_number_e164 ?? "",
                      )}
                    </span>
                    {m.triggered_by && (
                      <Badge variant="outline" className="text-xs">
                        {m.triggered_by}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 break-words">{m.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
                <Badge
                  variant={
                    m.status === "failed"
                      ? "destructive"
                      : m.status === "delivered" || m.status === "sent"
                        ? "default"
                        : "secondary"
                  }
                  className="shrink-0"
                >
                  {m.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
