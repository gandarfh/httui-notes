// ── Rust → Sidecar (incoming to sidecar) ─────────────────────────────

export interface ChatCommand {
  type: "chat";
  request_id: string;
  claude_session_id: string | null;
  cwd: string | null;
  allowed_tools: string[];
  content: ContentBlock[];
}

export interface PermissionResponseCommand {
  type: "permission_response";
  permission_id: string;
  decision: {
    behavior: "allow" | "deny";
    message?: string;
  };
}

export interface AbortCommand {
  type: "abort";
  request_id: string;
}

export interface PingCommand {
  type: "ping";
}

export type IncomingCommand =
  | ChatCommand
  | PermissionResponseCommand
  | AbortCommand
  | PingCommand;

// ── Sidecar → Rust (outgoing from sidecar) ───────────────────────────

export interface SessionEvent {
  type: "session";
  request_id: string;
  claude_session_id: string;
}

export interface TextDeltaEvent {
  type: "text_delta";
  request_id: string;
  text: string;
}

export interface ToolUseEvent {
  type: "tool_use";
  request_id: string;
  tool_use_id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: "tool_result";
  request_id: string;
  tool_use_id: string;
  content: ContentBlock[];
  is_error: boolean;
}

export interface PermissionRequestEvent {
  type: "permission_request";
  request_id: string;
  permission_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface DoneEvent {
  type: "done";
  request_id: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
  } | null;
  stop_reason: string | null;
}

export interface ErrorEvent {
  type: "error";
  request_id: string;
  category: "auth" | "rate_limit" | "network" | "invalid_input" | "internal";
  message: string;
}

export interface PongEvent {
  type: "pong";
}

export type OutgoingEvent =
  | SessionEvent
  | TextDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | PermissionRequestEvent
  | DoneEvent
  | ErrorEvent
  | PongEvent;

// ── Shared ───────────────────────────────────────────────────────────

export type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

// ── Helpers ──────────────────────────────────────────────────────────

export function send(event: OutgoingEvent): void {
  const line = JSON.stringify(event) + "\n";
  process.stdout.write(line);
}

export function log(...args: unknown[]): void {
  process.stderr.write(`[sidecar] ${args.join(" ")}\n`);
}

export function parseCommand(line: string): IncomingCommand | null {
  try {
    return JSON.parse(line) as IncomingCommand;
  } catch {
    log("Failed to parse command:", line);
    return null;
  }
}
