import { query, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatCommand, PermissionResponseCommand } from "../protocol.js";
import { send, log } from "../protocol.js";

// Active queries keyed by request_id, for interrupt support
const activeQueries = new Map<string, Query>();

// Pending permission requests keyed by permission_id
const pendingPermissions = new Map<
  string,
  {
    resolve: (decision: PermissionResponseCommand["decision"]) => void;
  }
>();

let permissionCounter = 0;

export async function handleChat(cmd: ChatCommand): Promise<void> {
  const { request_id, claude_session_id, cwd, allowed_tools, content } = cmd;

  try {
    // Build prompt from content blocks
    const textParts = content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text);
    const prompt = textParts.join("\n");

    if (!prompt.trim() && content.length === 0) {
      send({
        type: "error",
        request_id,
        category: "invalid_input",
        message: "Empty message content",
      });
      return;
    }

    const q = query({
      prompt,
      options: {
        ...(claude_session_id ? { resume: claude_session_id } : {}),
        ...(cwd ? { cwd } : {}),
        allowedTools: allowed_tools,
        permissionMode: "default",
        includePartialMessages: true,
        canUseTool: async (toolName, toolInput, { signal }) => {
          const permissionId = `perm_${++permissionCounter}`;

          send({
            type: "permission_request",
            request_id,
            permission_id: permissionId,
            tool_name: toolName,
            tool_input: toolInput,
          });

          const decision = await new Promise<
            PermissionResponseCommand["decision"]
          >((resolve, reject) => {
            pendingPermissions.set(permissionId, { resolve });
            signal.addEventListener("abort", () => {
              pendingPermissions.delete(permissionId);
              reject(new Error("Aborted"));
            });
          });

          if (decision.behavior === "allow") {
            return {
              behavior: "allow" as const,
              updatedInput: toolInput,
            };
          } else {
            return {
              behavior: "deny" as const,
              message: decision.message ?? "Denied by user",
            };
          }
        },
      },
    });

    activeQueries.set(request_id, q);

    let sessionEmitted = false;
    let lastPartialText = "";

    for await (const msg of q) {
      // Track partial text for delta extraction
      if (msg.type === "stream_event") {
        const event = msg.event;
        if (event.type === "content_block_delta" && "delta" in event) {
          const delta = event.delta as { type: string; text?: string };
          if (delta.type === "text_delta" && delta.text) {
            lastPartialText += delta.text;
            send({
              type: "text_delta",
              request_id,
              text: delta.text,
            });
          }
        }
        continue;
      }

      if (msg.type === "system" && msg.subtype === "init") {
        if (!sessionEmitted) {
          send({
            type: "session",
            request_id,
            claude_session_id: msg.session_id,
          });
          sessionEmitted = true;
        }
        continue;
      }

      if (msg.type === "assistant") {
        const content = msg.message?.content ?? [];
        for (const block of content) {
          if (block.type === "tool_use") {
            send({
              type: "tool_use",
              request_id,
              tool_use_id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>,
            });
          }
        }
        continue;
      }

      if (msg.type === "user") {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              typeof block === "object" &&
              block !== null &&
              "type" in block &&
              block.type === "tool_result" &&
              "tool_use_id" in block
            ) {
              const toolResult = block as {
                type: "tool_result";
                tool_use_id: string;
                content?: unknown;
                is_error?: boolean;
              };
              send({
                type: "tool_result",
                request_id,
                tool_use_id: toolResult.tool_use_id,
                content: Array.isArray(toolResult.content)
                  ? toolResult.content
                  : [
                      {
                        type: "text",
                        text: String(toolResult.content ?? ""),
                      },
                    ],
                is_error: toolResult.is_error ?? false,
              });
            }
          }
        }
        continue;
      }

      if (msg.type === "result") {
        const usage = msg.usage;
        send({
          type: "done",
          request_id,
          usage: {
            input_tokens: usage.input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
            cache_read_tokens: usage.cache_read_input_tokens ?? 0,
          },
          stop_reason: msg.subtype === "success" ? "end_turn" : "error",
        });
        continue;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    let category: "auth" | "rate_limit" | "network" | "internal" = "internal";
    if (message.includes("auth") || message.includes("login")) {
      category = "auth";
    } else if (message.includes("rate") || message.includes("429")) {
      category = "rate_limit";
    } else if (
      message.includes("network") ||
      message.includes("ECONNREFUSED")
    ) {
      category = "network";
    }

    send({ type: "error", request_id, category, message });
  } finally {
    activeQueries.delete(request_id);
  }
}

export function handleAbort(requestId: string): void {
  const q = activeQueries.get(requestId);
  if (q) {
    q.interrupt().catch(() => {});
    activeQueries.delete(requestId);
    log(`Interrupted request ${requestId}`);
  }
}

export function handlePermissionResponse(
  cmd: PermissionResponseCommand
): void {
  const pending = pendingPermissions.get(cmd.permission_id);
  if (pending) {
    pending.resolve(cmd.decision);
    pendingPermissions.delete(cmd.permission_id);
  } else {
    log(`No pending permission for ${cmd.permission_id}`);
  }
}
