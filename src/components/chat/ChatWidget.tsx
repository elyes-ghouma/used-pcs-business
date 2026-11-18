"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useT, useTKey } from "@/i18n/client";
import type { BotSuggestion } from "@/lib/chatbot/types";
import { formatPrice } from "@/lib/format";
import { productInterestMessage, safeExternalUrl, telUrl, whatsappUrl, type ContactSettings } from "@/lib/contact";
import type { ProductStatus } from "@/lib/types";
import { useChat } from "./ChatProvider";

type Card = { id: string; slug: string; name: string; price: number; status: ProductStatus; summary: string[] };
type Msg = {
  id: number;
  sender: "visitor" | "bot" | "admin";
  body: string;
  meta?: { products?: Card[]; action?: string | null; suggestions?: (BotSuggestion | string)[] };
  created_at: string;
};
type ApiState = { started?: boolean; escalated?: boolean; status?: string; messages: Msg[]; error?: string; message?: string };

/** Older stored messages kept their chips as plain strings. */
const asChip = (s: BotSuggestion | string): BotSuggestion => (typeof s === "string" ? { label: s, action: s === "Talk to the seller" ? "seller" : "send" } : s);

type Props = { welcome: string; currency: string; workingHours: string; contact: ContactSettings };

export function ChatWidget({ welcome, currency, workingHours, contact }: Props) {
  const { isOpen, openChat, closeChat, product } = useChat();
  const t = useT();
  const locale = useLocale();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [escalated, setEscalated] = useState(false);
  const [view, setView] = useState<"chat" | "seller">("chat");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const lastId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const merge = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !known.has(m.id))];
      lastId.current = next.reduce((max, m) => Math.max(max, m.id), 0);
      return next;
    });
  }, []);

  const apply = useCallback((state: ApiState) => {
    merge(state.messages ?? []);
    if (typeof state.escalated === "boolean") setEscalated(state.escalated);
  }, [merge]);

  // Load history once when first opened (the conversation token is in an httpOnly cookie).
  useEffect(() => {
    if (!isOpen || loadedRef.current) return;
    loadedRef.current = true;
    fetch("/api/chat?after=0")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: ApiState | null) => s && apply(s))
      .catch(() => undefined);
  }, [isOpen, apply]);

  // Poll for seller replies while the panel is open and the tab is visible.
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => {
      if (document.hidden) return;
      fetch(`/api/chat?after=${lastId.current}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s: ApiState | null) => s && apply(s))
        .catch(() => undefined);
    };
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [isOpen, apply]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, view, sending]);

  useEffect(() => {
    if (isOpen && view === "chat") inputRef.current?.focus();
  }, [isOpen, view]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeChat();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeChat]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, after: lastId.current, productId: product?.id ?? null }),
      });
      const data = (await res.json()) as ApiState;
      if (!res.ok) {
        setError(res.status === 429 ? t("chat.err.tooFast") : t("chat.err.unavailable"));
        setInput(message);
      } else {
        apply(data);
      }
    } catch {
      setError(t("chat.err.connection"));
      setInput(message);
    } finally {
      setSending(false);
    }
  }

  const lastBot = [...messages].reverse().find((m) => m.sender === "bot");
  const suggestions = !escalated ? (lastBot?.meta?.suggestions ?? []).map(asChip) : [];
  const offerSeller = !escalated && lastBot?.meta?.action === "offer_seller";
  const startSuggestions: BotSuggestion[] =
    messages.length === 0
      ? [{ label: t("chat.sug.budget"), action: "send" }, { label: t("chat.sug.how"), action: "send" }, { label: t("chat.sug.seller"), action: "seller" }]
      : suggestions;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={openChat}
        className="fixed bottom-4 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink shadow-lg shadow-black/50 transition-colors hover:bg-accent-strong"
        aria-label={t("chat.open")}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
        {t("chat.button")}
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={t("chat.dialog")}
      className="fixed inset-x-2 bottom-2 z-40 flex h-[min(34rem,calc(100dvh-1rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/60 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[24rem]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line bg-raised px-4 py-3">
        <div>
          <h2 className="text-xl">{view === "seller" ? t("chat.titleSeller") : t("chat.title")}</h2>
          <p className="text-xs text-muted">
            {view === "seller"
              ? t("chat.subSeller")
              : escalated
                ? t("chat.subEscalated")
                : t("chat.subBot")}
          </p>
        </div>
        <button type="button" onClick={closeChat} className="btn-secondary btn-sm" aria-label={t("chat.close")}>
          {t("common.close")}
        </button>
      </header>

      {view === "seller" ? (
        <SellerPanel
          contact={contact}
          productName={product?.name}
          productId={product?.id ?? null}
          workingHours={workingHours}
          onBack={() => setView("chat")}
          onSent={(state) => {
            apply(state);
            setEscalated(true);
            setView("chat");
          }}
          lastId={lastId}
        />
      ) : (
        <>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" aria-relevant="additions">
            {messages.length === 0 && <Bubble who="bot">{welcome}</Bubble>}
            {product && messages.length === 0 && (
              <p className="text-xs text-muted">{t("chat.viewing", { name: product.name })}</p>
            )}
            {messages.map((m) => (
              <div key={m.id}>
                <Bubble who={m.sender}>{m.body}</Bubble>
                {m.meta?.products && m.meta.products.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {m.meta.products.map((p) => (
                      <li key={p.id}>
                        <Link href={`/pcs/${p.slug}`} onClick={() => undefined} className="block rounded-md border border-line bg-bg p-3 hover:border-accent">
                          <span className="block font-medium">{p.name}</span>
                          <span className="block text-sm text-muted">{p.summary.join(" | ")}</span>
                          <span className="mt-1 flex items-center justify-between text-sm">
                            <span className="font-semibold text-accent-strong">{formatPrice(p.price, currency, locale)}</span>
                            <span className="text-muted">{t(`status.${p.status}`)}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {sending && <p className="text-sm text-muted" role="status">{t("chat.typing")}</p>}
            {error && <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            {escalated && (
              <p className="rounded-md border border-line bg-bg px-3 py-2 text-xs text-muted">
                {t("chat.escalatedNote")}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t border-line px-3 py-3">
            {(offerSeller || startSuggestions.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {startSuggestions.map((s) =>
                  s.action === "seller" ? (
                    <button key={s.label} type="button" className="btn-secondary btn-sm" onClick={() => setView("seller")}>{s.label}</button>
                  ) : (
                    <button key={s.label} type="button" className="btn-secondary btn-sm" onClick={() => send(s.text ?? s.label)} disabled={sending}>{s.label}</button>
                  ),
                )}
                {offerSeller && !startSuggestions.some((s) => s.action === "seller") && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => setView("seller")}>{t("chat.contactSeller")}</button>
                )}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex gap-2"
            >
              <label htmlFor="chat-input" className="sr-only">{t("chat.yourMessage")}</label>
              <input
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="field"
                placeholder={escalated ? t("chat.placeholderSeller") : t("chat.placeholder")}
                maxLength={1000}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary" disabled={sending || input.trim() === ""}>{t("chat.send")}</button>
            </form>
            {!escalated && (
              <button type="button" className="w-full text-center text-sm text-accent hover:text-accent-strong" onClick={() => setView("seller")}>
                {t("chat.contactInstead")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Bubble({ who, children }: { who: Msg["sender"]; children: React.ReactNode }) {
  const t = useT();
  const mine = who === "visitor";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {!mine && (
        <span className="mb-0.5 text-xs text-muted">{who === "admin" ? t("chat.seller") : t("chat.assistant")}</span>
      )}
      <p
        className={`max-w-[88%] whitespace-pre-line rounded-lg px-3 py-2 text-[0.95rem] ${
          mine ? "bg-accent text-accent-ink" : who === "admin" ? "border border-accent/50 bg-raised" : "bg-raised"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

function SellerPanel({
  contact, productName, productId, workingHours, onBack, onSent, lastId,
}: {
  contact: ContactSettings;
  productName?: string;
  productId: string | null;
  workingHours: string;
  onBack: () => void;
  onSent: (s: ApiState) => void;
  lastId: React.RefObject<number>;
}) {
  const t = useT();
  const tKey = useTKey();
  const locale = useLocale();
  const [name, setName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [message, setMessage] = useState(productName ? productInterestMessage(productName, locale) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wa = whatsappUrl(contact.whatsapp_number, productInterestMessage(productName, locale));
  const messenger = safeExternalUrl(contact.messenger_url);
  const tel = telUrl(contact.phone);

  const track = (channel: string) => {
    void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, productId }), keepalive: true }).catch(() => undefined);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contact: contactValue, message, after: lastId.current, productId }),
      });
      const data = (await res.json()) as ApiState;
      if (!res.ok) setError(data.message ? tKey(data.message) : t("chat.err.escalate"));
      else onSent(data);
    } catch {
      setError(t("chat.err.connection"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
      <div className="grid gap-2">
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary" onClick={() => track("whatsapp")}>{t("chat.panel.whatsapp")}</a>}
        {messenger && <a href={messenger} target="_blank" rel="noopener noreferrer" className="btn-secondary" onClick={() => track("messenger")}>{t("chat.panel.messenger")}</a>}
        {tel && <a href={tel} className="btn-secondary" onClick={() => track("phone")}>{t("chat.panel.call", { phone: contact.phone })}</a>}
      </div>
      {workingHours && <p className="whitespace-pre-line text-sm text-muted">{t("chat.panel.hours", { hours: workingHours })}</p>}
      <form onSubmit={submit} className="space-y-3 border-t border-line pt-4">
        <p className="font-medium">{t("chat.panel.leave")}</p>
        <div>
          <label htmlFor="esc-name" className="label">{t("chat.panel.name")}</label>
          <input id="esc-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} autoComplete="name" />
        </div>
        <div>
          <label htmlFor="esc-contact" className="label">{t("chat.panel.contact")}</label>
          <input id="esc-contact" className="field" value={contactValue} onChange={(e) => setContactValue(e.target.value)} required minLength={6} maxLength={200} autoComplete="tel" />
        </div>
        <div>
          <label htmlFor="esc-message" className="label">{t("chat.panel.message")}</label>
          <textarea id="esc-message" className="field" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={3} maxLength={2000} />
        </div>
        {error && <p role="alert" className="error-text">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={busy}>{busy ? t("common.sending") : t("chat.panel.send")}</button>
          <button type="button" className="btn-secondary" onClick={onBack}>{t("common.back")}</button>
        </div>
      </form>
    </div>
  );
}
