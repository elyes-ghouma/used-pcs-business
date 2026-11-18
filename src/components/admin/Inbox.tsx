"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { sendReplyAction, setConversationStatusAction } from "@/app/admin/actions/business";
import { formatDate } from "@/lib/format";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export type Conversation = {
  id: string;
  visitor_name: string;
  visitor_contact: string;
  product_id: string | null;
  status: "open" | "resolved";
  escalated: boolean;
  needs_attention: boolean;
  last_message_at: string;
  created_at: string;
  products: { name: string } | null;
};
type Message = { id: number; conversation_id: string; sender: "visitor" | "bot" | "admin"; body: string; created_at: string };
type Filter = "attention" | "open" | "resolved";

const SELECT = "id, visitor_name, visitor_contact, product_id, status, escalated, needs_attention, last_message_at, created_at, products(name)";

export function Inbox({ initial }: { initial: Conversation[] }) {
  const [supabase] = useState(() => createBrowserSupabase());
  const [conversations, setConversations] = useState<Conversation[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<Filter>("attention");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const loadConversations = useCallback(async () => {
    const { data } = await supabase.from("conversations").select(SELECT).order("last_message_at", { ascending: false }).limit(100);
    if (data) setConversations(data as unknown as Conversation[]);
  }, [supabase]);

  const loadMessages = useCallback(async (id: string) => {
    const { data } = await supabase.from("messages").select("id, conversation_id, sender, body, created_at").eq("conversation_id", id).order("id");
    if (data && selectedRef.current === id) setMessages(data as Message[]);
  }, [supabase]);

  // Realtime: new messages and conversation changes arrive without refreshing. A slow poll is the safety net.
  useEffect(() => {
    const channel = supabase
      .channel("admin-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => void loadConversations())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as Message;
        void loadConversations();
        if (row.conversation_id === selectedRef.current) setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(() => {
      void loadConversations();
      if (selectedRef.current) void loadMessages(selectedRef.current);
    }, 20000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [supabase, loadConversations, loadMessages]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  const select = (id: string) => {
    setSelectedId(id);
    setMessages([]);
    setError(null);
    void loadMessages(id);
  };

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const visible = conversations.filter((c) =>
    filter === "attention" ? c.needs_attention && c.status === "open" : filter === "open" ? c.status === "open" : c.status === "resolved",
  );
  const attentionCount = conversations.filter((c) => c.needs_attention && c.status === "open").length;

  async function send() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError(null);
    const res = await sendReplyAction(selected.id, reply);
    setBusy(false);
    if (!res.ok) return setError(res.message ?? "Could not send.");
    setReply("");
    void loadMessages(selected.id);
    void loadConversations();
  }

  async function toggleResolved() {
    if (!selected) return;
    await setConversationStatusAction(selected.id, selected.status === "open" ? "resolved" : "open");
    void loadConversations();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-5xl">Chat inbox</h1>
          <p className="mt-1 text-muted">Conversations from the website chat. Replies show up in the visitor&apos;s chat window.</p>
        </div>
        <p className="text-sm text-muted" role="status">{live ? "Live: new messages appear automatically" : "Connecting to live updates..."}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section aria-label="Conversations" className={`panel ${selected ? "hidden lg:block" : ""}`}>
          <div className="flex gap-1 border-b border-line p-2" role="tablist" aria-label="Filter conversations">
            {([["attention", `Needs reply${attentionCount ? ` (${attentionCount})` : ""}`], ["open", "Open"], ["resolved", "Resolved"]] as [Filter, string][]).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`btn btn-sm flex-1 ${filter === key ? "bg-raised text-accent-strong" : "text-muted"}`}>{label}</button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="p-6 text-muted">{filter === "attention" ? "No conversations are waiting for your reply." : "No conversations here."}</p>
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-line-soft overflow-y-auto">
              {visible.map((c) => (
                <li key={c.id}>
                  <button onClick={() => select(c.id)} aria-current={c.id === selectedId} className={`block w-full px-4 py-3 text-left hover:bg-raised ${c.id === selectedId ? "bg-raised" : ""}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.visitor_name || "Anonymous visitor"}</span>
                      {c.needs_attention && c.status === "open" && <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-semibold text-accent-ink">Needs reply</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">{c.products?.name ?? "General chat"}{!c.escalated ? " · bot only" : ""}</span>
                    <span className="block text-xs text-muted">{formatDate(c.last_message_at, true)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Conversation" className={`panel flex min-h-[26rem] flex-col ${selected ? "" : "hidden lg:flex"}`}>
          {!selected ? (
            <p className="m-auto p-8 text-muted">Select a conversation to read it.</p>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
                <div className="min-w-0">
                  <button className="mb-1 text-sm text-muted lg:hidden" onClick={() => setSelectedId(null)}>&larr; All conversations</button>
                  <h2 className="text-2xl">{selected.visitor_name || "Anonymous visitor"}</h2>
                  <p className="text-sm text-muted">{selected.visitor_contact || "No contact details given"}</p>
                  {selected.product_id && (
                    <p className="text-sm">About: <Link href={`/admin/products/${selected.product_id}`} className="text-accent hover:text-accent-strong">{selected.products?.name ?? "product"}</Link></p>
                  )}
                </div>
                <button onClick={toggleResolved} className="btn-secondary btn-sm">{selected.status === "open" ? "Mark resolved" : "Reopen"}</button>
              </header>
              <div ref={threadRef} className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "50dvh" }} aria-live="polite">
                {messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.sender === "admin" ? "items-end" : "items-start"}`}>
                    <span className="mb-0.5 text-xs text-muted">
                      {m.sender === "visitor" ? "Visitor" : m.sender === "admin" ? "You" : "Automated reply"} &middot; {formatDate(m.created_at, true)}
                    </span>
                    <p className={`max-w-[85%] whitespace-pre-line rounded-lg px-3 py-2 ${m.sender === "admin" ? "bg-accent text-accent-ink" : m.sender === "bot" ? "border border-dashed border-line bg-bg text-muted" : "bg-raised"}`}>{m.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="space-y-2 border-t border-line p-4">
                {error && <p role="alert" className="error-text">{error}</p>}
                <label htmlFor="reply" className="label">Reply</label>
                <textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={2000} className="field" placeholder="Write your reply. The visitor sees it in their chat window." />
                <div className="flex items-center justify-between gap-3">
                  <p className="hint">The visitor sees replies only while their chat window is open or when they return.</p>
                  <button type="submit" className="btn-primary" disabled={busy || !reply.trim()}>{busy ? "Sending..." : "Send reply"}</button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
