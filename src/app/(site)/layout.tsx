import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getSettings } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <ChatProvider>
      <SiteHeader settings={settings} />
      {!isSupabaseConfigured() && (
        <p role="alert" className="border-b border-warn/40 bg-warn/10 px-4 py-2 text-center text-sm text-warn">
          Setup needed: Supabase is not configured yet. Add the environment variables described in the README.
        </p>
      )}
      <main id="main">{children}</main>
      <SiteFooter settings={settings} />
      <ChatWidget
        welcome={settings.chatbot_welcome}
        currency={settings.currency}
        workingHours={settings.working_hours}
        contact={{
          phone: settings.phone,
          whatsapp_number: settings.whatsapp_number,
          messenger_url: settings.messenger_url,
          facebook_url: settings.facebook_url,
          instagram_url: settings.instagram_url,
        }}
      />
    </ChatProvider>
  );
}
