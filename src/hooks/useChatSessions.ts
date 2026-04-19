import { useState, useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
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

  // Start with a fresh session, or reuse the latest if it has no messages
  useEffect(() => {
    refresh().then(async () => {
      const list = await listChatSessions();
      if (list.length > 0 && list[0].title === "Nova conversa") {
        // Latest session is empty, reuse it
        setActiveSessionId(list[0].id);
      } else {
        // Create a new session
        const session = await createChatSession();
        await refresh();
        setActiveSessionId(session.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh when session title changes (auto-title)
  useEffect(() => {
    const unlisten = listen("chat:session-updated", () => {
      refresh();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
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
        await refresh();
        const remaining = await listChatSessions();
        if (remaining.length === 0) {
          // Auto-create a new session when the last one is archived
          const session = await createChatSession();
          setSessions([session]);
          setActiveSessionId(session.id);
        } else if (activeSessionId === id) {
          setActiveSessionId(remaining[0].id);
        }
      } catch (e) {
        console.error("Failed to archive chat session:", e);
      }
    },
    [activeSessionId, refresh],
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
