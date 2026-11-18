"use client";

import { useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import { productInterestMessage, safeExternalUrl, telUrl, whatsappUrl, type ContactSettings } from "@/lib/contact";
import { useChat } from "./chat/ChatProvider";

type Props = {
  contact: ContactSettings;
  product?: { id: string; name: string } | null;
  /** "stack" = full-width buttons (product page); "row" = compact (home, contact page). */
  layout?: "stack" | "row";
};

function track(channel: "whatsapp" | "messenger" | "phone" | "chat", productId?: string) {
  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, productId: productId ?? null }),
      keepalive: true,
    });
  } catch {
    // tracking must never block contacting the seller
  }
}

/** Only channels the owner has configured are rendered, so there are no dead buttons. */
export function ContactActions({ contact, product = null, layout = "row" }: Props) {
  const { openChat } = useChat();
  const t = useT();
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const message = productInterestMessage(product?.name, locale);
  const wa = whatsappUrl(contact.whatsapp_number, message);
  const messenger = safeExternalUrl(contact.messenger_url);
  const tel = telUrl(contact.phone);
  const wrap = layout === "stack" ? "grid gap-2.5" : "flex flex-wrap gap-2.5";
  const btn = layout === "stack" ? "w-full" : "";

  return (
    <div>
      <div className={wrap}>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={`btn-primary ${btn}`} onClick={() => track("whatsapp", product?.id)}>
            {t("actions.whatsapp")}
          </a>
        )}
        {messenger && (
          <a
            href={messenger}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn-secondary ${btn}`}
            onClick={() => {
              track("messenger", product?.id);
              // Messenger links cannot be prefilled, so copy the message for pasting.
              navigator.clipboard?.writeText(message).then(() => setCopied(true), () => undefined);
            }}
          >
            {t("actions.messenger")}
          </a>
        )}
        {tel && (
          <a href={tel} className={`btn-secondary ${btn}`} onClick={() => track("phone", product?.id)}>
            {t("actions.call", { phone: contact.phone })}
          </a>
        )}
        <button
          type="button"
          className={`btn-secondary ${btn}`}
          onClick={() => {
            track("chat", product?.id);
            openChat();
          }}
        >
          {t("actions.chat")}
        </button>
      </div>
      {copied && (
        <p role="status" className="hint">
          {t("actions.copied")}
        </p>
      )}
    </div>
  );
}
