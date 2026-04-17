import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  listChatMessages,
  sendChatMessage,
  abortChat,
  type ChatMessage,
} from "@/lib/tauri/chat";

interface ChatDeltaPayload {
  session_id: number;
  text: string;
}

interface ChatDonePayload {
  session_id: number;
  usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number } | null;
  stop_reason: string | null;
}

interface ChatErrorPayload {
  session_id: number;
  category: string;
  message: string;
}

export function useChat(sessionId: number | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contentRef = useRef("");
  const rafId = useRef(0);
  const activeRequestId = useRef<string | null>(null);

  // Load messages when session changes
  useEffect(() => {
    if (sessionId === null) {
      setMessages([]);
      setStreamingContent("");
      setIsStreaming(false);
      setError(null);
      return;
    }

    let cancelled = false;
    listChatMessages(sessionId).then((msgs) => {
      if (!cancelled) setMessages(msgs);
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Listen to Tauri events
  useEffect(() => {
    if (sessionId === null) return;

    const unlistens: Promise<() => void>[] = [];

    console.log("[useChat] Setting up event listeners for session", sessionId);

    unlistens.push(
      listen<ChatDeltaPayload>("chat:delta", (event) => {
        console.log("[useChat] chat:delta", event.payload);
        if (event.payload.session_id !== sessionId) return;
        contentRef.current += event.payload.text;
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          setStreamingContent(contentRef.current);
        });
      })
    );

    unlistens.push(
      listen<ChatDonePayload>("chat:done", (event) => {
        console.log("[useChat] chat:done", event.payload);
        if (event.payload.session_id !== sessionId) return;
        contentRef.current = "";
        setStreamingContent("");
        setIsStreaming(false);
        activeRequestId.current = null;
        // Reload messages from DB (source of truth)
        listChatMessages(sessionId).then(setMessages).catch(console.error);
      })
    );

    unlistens.push(
      listen<ChatErrorPayload>("chat:error", (event) => {
        console.log("[useChat] chat:error", event.payload);
        if (event.payload.session_id !== sessionId) return;
        contentRef.current = "";
        setStreamingContent("");
        setIsStreaming(false);
        activeRequestId.current = null;

        const { category, message } = event.payload;
        if (category === "auth") {
          setError("Authentication required. Run `claude login` in your terminal.");
        } else if (category === "rate_limit") {
          setError("Rate limit reached. Please wait a moment.");
        } else {
          setError(message);
        }
        // Reload messages (partial message may have been saved)
        listChatMessages(sessionId).then(setMessages).catch(console.error);
      })
    );

    return () => {
      for (const u of unlistens) {
        u.then((fn) => fn());
      }
      cancelAnimationFrame(rafId.current);
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (sessionId === null || !text.trim()) return;
      setError(null);

      // Optimistically add user message to local state
      const optimisticMsg: ChatMessage = {
        id: -Date.now(),
        session_id: sessionId,
        role: "user",
        turn_index: messages.length,
        content_json: JSON.stringify([{ type: "text", text }]),
        tokens_in: null,
        tokens_out: null,
        is_partial: false,
        created_at: Math.floor(Date.now() / 1000),
        tool_calls: [],
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      contentRef.current = "";
      setStreamingContent("");
      setIsStreaming(true);

      try {
        console.log("[useChat] Sending message to session", sessionId, ":", text);
        await sendChatMessage(sessionId, text);
        console.log("[useChat] sendChatMessage returned (command dispatched)");
      } catch (e) {
        console.error("[useChat] sendChatMessage error:", e);
        setIsStreaming(false);
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [sessionId, messages.length]
  );

  const abort = useCallback(() => {
    if (activeRequestId.current) {
      abortChat(activeRequestId.current).catch(console.error);
    }
  }, []);

  return {
    messages,
    streamingContent,
    isStreaming,
    error,
    sendMessage,
    abort,
  };
}
