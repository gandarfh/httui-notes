import { createContext, useContext } from "react";
import type { ChatSession, ChatMessage } from "@/lib/tauri/chat";

export interface ChatContextValue {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: number | null;
  selectSession: (id: number) => void;
  createSession: () => Promise<ChatSession>;
  archiveSession: (id: number) => Promise<void>;
  // Chat
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  abort: () => void;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatContext.Provider");
  return ctx;
}
