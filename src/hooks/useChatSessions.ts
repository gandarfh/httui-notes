import { useState, useCallback, useEffect } from "react";
import {
  listChatSessions,
  createChatSession,
  archiveChatSession,
  type ChatSession,
} from "@/lib/tauri/chat";

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listChatSessions();
      setSessions(list);
    } catch (e) {
      console.error("Failed to list chat sessions:", e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectSession = useCallback((id: number) => {
    setActiveSessionId(id);
  }, []);

  const create = useCallback(async () => {
    try {
      const session = await createChatSession();
      await refresh();
      setActiveSessionId(session.id);
      return session;
    } catch (e) {
      console.error("Failed to create chat session:", e);
      throw e;
    }
  }, [refresh]);

  const archive = useCallback(
    async (id: number) => {
      try {
        await archiveChatSession(id);
        if (activeSessionId === id) {
          setActiveSessionId(null);
        }
        await refresh();
      } catch (e) {
        console.error("Failed to archive chat session:", e);
      }
    },
    [activeSessionId, refresh]
  );

  return {
    sessions,
    activeSessionId,
    selectSession,
    createSession: create,
    archiveSession: archive,
    refreshSessions: refresh,
  };
}
