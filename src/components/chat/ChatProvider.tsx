"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ChatProduct = { id: string; name: string; slug: string };

type ChatContextValue = {
  isOpen: boolean;
  product: ChatProduct | null;
  openChat: () => void;
  closeChat: () => void;
  setProduct: (p: ChatProduct | null) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [product, setProduct] = useState<ChatProduct | null>(null);
  const openChat = useCallback(() => setOpen(true), []);
  const closeChat = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ isOpen, product, openChat, closeChat, setProduct }), [isOpen, product, openChat, closeChat]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}

/** Rendered by product pages so the chat knows which PC the visitor is looking at. */
export function SetChatProduct({ product }: { product: ChatProduct }) {
  const { setProduct } = useChat();
  useEffect(() => {
    setProduct(product);
    return () => setProduct(null);
  }, [product, setProduct]);
  return null;
}
