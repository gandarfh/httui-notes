import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  listChatMessages,
  sendChatMessage,
  abortChat,
  respondChatPermission,
  deleteMessagesAfter,
  clearSessionClaudeId,
  type ChatMessage,
  type AttachmentInput,
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

interface ChatToolUsePayload {
  session_id: number;
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ChatToolResultPayload {
  session_id: number;
  tool_use_id: string;
  content: unknown[];
  is_error: boolean;
}

interface ChatPermissionRequestPayload {
  session_id: number;
  permission_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ToolActivity {
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  pending: boolean;
}

export type ContentSegment =
  | { type: "text"; text: string }
  | { type: "tool_group"; toolUseIds: string[] };

export interface PendingPermission {
  permissionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

/** Tracks files being updated via MCP update_note — used to suppress auto-save during write */
interface PendingFileUpdate {
  filePath: string;
  toolUseId: string;
}

export interface ChatFileCallbacks {
  onFileWriteStart?: (filePath: string) => void;
  onFileWriteComplete?: (filePath: string) => void;
}

export function useChat(sessionId: number | null, fileCallbacks?: ChatFileCallbacks) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSegments, setStreamingSegments] = useState<ContentSegment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolActivity, setToolActivity] = useState<Map<string, ToolActivity>>(new Map());
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [resumeFailed, setResumeFailed] = useState(false);
  const pendingFileUpdates = useRef<PendingFileUpdate[]>([]);

  const contentRef = useRef("");
  const segmentsRef = useRef<ContentSegment[]>([]);
  const rafId = useRef(0);
  const activeRequestId = useRef<string | null>(null);

  // Load messages when session changes
  useEffect(() => {
    if (sessionId === null) {
      setMessages([]);
      setStreamingContent("");
      setStreamingSegments([]);
      setIsStreaming(false);
      setError(null);
      setToolActivity(new Map());
      setPendingPermission(null);
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

    unlistens.push(
      listen<ChatDeltaPayload>("chat:delta", (event) => {
        if (event.payload.session_id !== sessionId) return;
        contentRef.current += event.payload.text;
        // Track segments: append to current text segment or start a new one after tools
        const segs = segmentsRef.current;
        const last = segs[segs.length - 1];
        if (last && last.type === "text") {
          last.text += event.payload.text;
        } else {
          segs.push({ type: "text", text: event.payload.text });
        }
        cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          setStreamingContent(contentRef.current);
          setStreamingSegments([...segs]);
        });
      })
    );

    unlistens.push(
      listen<ChatToolUsePayload>("chat:tool_use", (event) => {
        if (event.payload.session_id !== sessionId) return;
        const { tool_use_id, name, input } = event.payload;
        // Track tool_group segment
        const segs = segmentsRef.current;
        const last = segs[segs.length - 1];
        if (last && last.type === "tool_group") {
          last.toolUseIds.push(tool_use_id);
        } else {
          segs.push({ type: "tool_group", toolUseIds: [tool_use_id] });
        }
        setStreamingSegments([...segs]);
        setToolActivity((prev) => {
          const next = new Map(prev);
          next.set(tool_use_id, { name, input, pending: true });
          return next;
        });
        // Track update_note calls to manage auto-save suppression
        if (name.includes("update_note") && input.path) {
          const filePath = String(input.path);
          pendingFileUpdates.current.push({ filePath, toolUseId: tool_use_id });
          fileCallbacks?.onFileWriteStart?.(filePath);
        }
      })
    );

    unlistens.push(
      listen<ChatToolResultPayload>("chat:tool_result", (event) => {
        if (event.payload.session_id !== sessionId) return;
        const { tool_use_id, content, is_error } = event.payload;
        const resultText = content
          .map((c: unknown) => {
            if (typeof c === "object" && c !== null && "text" in c) {
              return (c as { text: string }).text;
            }
            return JSON.stringify(c);
          })
          .join("\n");
        setToolActivity((prev) => {
          const next = new Map(prev);
          const existing = next.get(tool_use_id);
          if (existing) {
            next.set(tool_use_id, { ...existing, result: resultText, isError: is_error, pending: false });
          }
          return next;
        });
        // Check if this is a completed update_note — signal file write complete
        const idx = pendingFileUpdates.current.findIndex((p) => p.toolUseId === tool_use_id);
        if (idx >= 0) {
          const { filePath } = pendingFileUpdates.current[idx];
          pendingFileUpdates.current.splice(idx, 1);
          if (!is_error) {
            fileCallbacks?.onFileWriteComplete?.(filePath);
          }
        }
      })
    );

    unlistens.push(
      listen<ChatPermissionRequestPayload>("chat:permission_request", (event) => {
        if (event.payload.session_id !== sessionId) return;
        const { permission_id, tool_name, tool_input } = event.payload;
        setPendingPermission({
          permissionId: permission_id,
          toolName: tool_name,
          toolInput: tool_input,
        });
      })
    );

    unlistens.push(
      listen<ChatDonePayload>("chat:done", (event) => {
        if (event.payload.session_id !== sessionId) return;
        contentRef.current = "";
        segmentsRef.current = [];
        setStreamingContent("");
        setStreamingSegments([]);
        setIsStreaming(false);
        setToolActivity(new Map());
        setPendingPermission(null);
        activeRequestId.current = null;
        listChatMessages(sessionId).then(setMessages).catch(console.error);
      })
    );

    unlistens.push(
      listen<ChatErrorPayload>("chat:error", (event) => {
        if (event.payload.session_id !== sessionId) return;
        contentRef.current = "";
        segmentsRef.current = [];
        setStreamingContent("");
        setStreamingSegments([]);
        setIsStreaming(false);
        setToolActivity(new Map());
        setPendingPermission(null);
        activeRequestId.current = null;

        const { category, message } = event.payload;
        if (category === "auth") {
          setError("Authentication required. Run `claude login` in your terminal.");
        } else if (category === "rate_limit") {
          setError("Rate limit reached. Please wait a moment.");
        } else if (category === "resume_failed") {
          setResumeFailed(true);
          setError("Session could not be resumed.");
        } else {
          setError(message);
        }
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

  const sendMsg = useCallback(
    async (text: string, attachments?: AttachmentInput[]) => {
      if (sessionId === null) return;
      const hasContent = text.trim() || (attachments && attachments.length > 0);
      if (!hasContent) return;
      setError(null);
      setToolActivity(new Map());

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
      segmentsRef.current = [];
      setStreamingContent("");
      setStreamingSegments([]);
      setIsStreaming(true);

      try {
        const requestId = await sendChatMessage(sessionId, text, attachments ?? []);
        activeRequestId.current = requestId;
      } catch (e) {
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

  const respondPermission = useCallback(
    async (permissionId: string, behavior: "allow" | "deny", scope: "once" | "session" | "always" = "once") => {
      try {
        const toolName = pendingPermission?.toolName;
        console.log("[useChat] respondPermission", { permissionId, behavior, scope, toolName });
        await respondChatPermission(permissionId, behavior, scope, toolName);
        console.log("[useChat] respondPermission OK");
        setPendingPermission(null);
      } catch (e) {
        console.error("[useChat] Failed to respond to permission:", e);
      }
    },
    [pendingPermission]
  );

  const editAndResend = useCallback(
    async (turnIndex: number, newText: string) => {
      if (sessionId === null) return;
      // Delete this message and all after it
      await deleteMessagesAfter(sessionId, turnIndex);
      // Reload to get clean state
      const msgs = await listChatMessages(sessionId);
      setMessages(msgs);
      // Send the edited message
      await sendMsg(newText);
    },
    [sessionId, sendMsg]
  );

  const resetAndContinue = useCallback(async () => {
    if (sessionId === null) return;
    // Clear the claude_session_id so next message starts fresh
    await clearSessionClaudeId(sessionId);
    setResumeFailed(false);
    setError(null);

    // Find the last user message and re-send it
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      try {
        const blocks = JSON.parse(lastUserMsg.content_json);
        const text = Array.isArray(blocks)
          ? blocks.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n")
          : String(blocks);
        await sendMsg(text);
      } catch {
        // fallback
      }
    }
  }, [sessionId, messages, sendMsg]);

  const regenerate = useCallback(async () => {
    if (sessionId === null || messages.length < 2) return;
    // Find last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    // Delete the assistant response (and anything after the user msg)
    await deleteMessagesAfter(sessionId, lastUserMsg.turn_index + 1);
    const msgs = await listChatMessages(sessionId);
    setMessages(msgs);
    // Parse original user text
    try {
      const blocks = JSON.parse(lastUserMsg.content_json);
      const text = Array.isArray(blocks)
        ? blocks.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n")
        : String(blocks);
      await sendMsg(text);
    } catch {
      // Fallback
      await sendMsg(lastUserMsg.content_json);
    }
  }, [sessionId, messages, sendMsg]);

  return {
    messages,
    streamingContent,
    streamingSegments,
    isStreaming,
    error,
    toolActivity,
    pendingPermission,
    resumeFailed,
    sendMessage: sendMsg,
    abort,
    respondPermission,
    editAndResend,
    regenerate,
    resetAndContinue,
  };
}
