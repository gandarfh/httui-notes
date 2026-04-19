import { createContext, useContext } from "react";
import type { ChatSession, ChatMessage, AttachmentInput } from "@/lib/tauri/chat";
import type { ToolActivity, PendingPermission } from "@/hooks/useChat";

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
  sendMessage: (text: string, attachments?: AttachmentInput[]) => Promise<void>;
  abort: () => void;
  // Tool use
  toolActivity: Map<string, ToolActivity>;
  pendingPermission: PendingPermission | null;
  respondPermission: (permissionId: string, behavior: "allow" | "deny", scope?: "once" | "session" | "always") => Promise<void>;
  // Edit & regenerate
  editAndResend: (turnIndex: number, newText: string) => Promise<void>;
  regenerate: () => Promise<void>;
  // Resume failure
  resumeFailed: boolean;
  resetAndContinue: () => Promise<void>;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatContext.Provider");
  return ctx;
}
