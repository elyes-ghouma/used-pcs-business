import { ChatProvider } from "@/components/chat/ChatProvider";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { I18nProvider } from "@/i18n/client";
import { getPublicSettings, getT } from "@/i18n/server";
import { isGatewayConfigured } from "@/lib/gateway";
import { isSupabaseConfigured } from "@/lib/supabase/public";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [settings, { t, locale }] = await Promise.all([getPublicSettings(), getT()]);
  return (
    <I18nProvider locale={locale}>
      {/* The public site declares its own language (the admin area stays English). */}
      <div lang={locale}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
        >
          {t("common.skip")}
        </a>
        <ChatProvider>
          <SiteHeader settings={settings} />
          {!isSupabaseConfigured() && (
            <p role="alert" className="border-b border-warn/40 bg-warn/10 px-4 py-2 text-center text-sm text-warn">
              Setup needed: Supabase is not configured yet. Add the environment variables described in the README.
            </p>
          )}
          {isSupabaseConfigured() && !isGatewayConfigured() && (
            <p role="alert" className="border-b border-warn/40 bg-warn/10 px-4 py-2 text-center text-sm text-warn">
              Setup needed: GATEWAY_KEY is missing, so the chat and contact form are switched off. See the README (Security configuration).
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
      </div>
    </I18nProvider>
  );
}
