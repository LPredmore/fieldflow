import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sliders, MessageSquare } from "lucide-react";
import SMSSettings from "@/components/Settings/SMSSettings";
import { UnifiedNotificationMatrix } from "@/components/Settings/UnifiedNotificationMatrix";

export default function NotificationSettings() {
  return (
    <Tabs defaultValue="preferences" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2">
        <TabsTrigger value="preferences" className="gap-2">
          <Sliders className="h-4 w-4" />
          Preferences
        </TabsTrigger>
        <TabsTrigger value="sms" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          SMS Setup
        </TabsTrigger>
      </TabsList>
      <TabsContent value="preferences" className="mt-6">
        <UnifiedNotificationMatrix />
      </TabsContent>
      <TabsContent value="sms" className="mt-6">
        <SMSSettings />
      </TabsContent>
    </Tabs>
  );
}
