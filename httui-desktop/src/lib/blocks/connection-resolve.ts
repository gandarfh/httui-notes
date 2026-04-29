import type { Connection } from "@/lib/tauri/connections";

/**
 * Resolve a connection identifier (from a db block info string, e.g.
 * `connection=prod` or `connection=<uuid>`) to the matching Connection.
 *
 * Priority: slug/name match → UUID match → null. Raw stays readable
 * (`connection=prod`); renames update the name but UUID fallback keeps
 * stale references working.
 */
export function resolveConnectionIdentifier(
  connections: readonly Connection[],
  identifier: string | undefined,
): Connection | null {
  if (!identifier) return null;
  const byName = connections.find((c) => c.name === identifier);
  if (byName) return byName;
  const byId = connections.find((c) => c.id === identifier);
  return byId ?? null;
}
