import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

interface ConnectionStatus {
  connectionId: string;
  name: string;
  status: "connected" | "disconnected";
}

interface ConnectionStatusEvent {
  connection_id: string;
  name: string;
  status: string;
}

export function useConnectionStatus() {
  const [connections, setConnections] = useState<Map<string, ConnectionStatus>>(new Map());

  useEffect(() => {
    const unlisten = listen<ConnectionStatusEvent>("connection-status", (event) => {
      const { connection_id, name, status } = event.payload;
      setConnections((prev) => {
        const next = new Map(prev);
        if (status === "disconnected") {
          next.delete(connection_id);
        } else {
          next.set(connection_id, {
            connectionId: connection_id,
            name,
            status: status as "connected" | "disconnected",
          });
        }
        return next;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Return the most recently connected connection for display
  const activeConnection = connections.size > 0
    ? Array.from(connections.values()).pop() ?? null
    : null;

  return { connections, activeConnection };
}
