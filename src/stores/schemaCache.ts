import { create } from "zustand";
import { devtools } from "zustand/middleware";

import {
  introspectSchema,
  getCachedSchema,
  type SchemaEntry,
} from "@/lib/tauri/connections";

/**
 * Table shape derived from flat SchemaEntry rows: one table groups its columns
 * (with data types) and remembers the raw entries for panel rendering.
 */
export interface SchemaTable {
  /** Qualifying namespace (Postgres `table_schema`, MySQL active DB). Null for SQLite. */
  schema: string | null;
  name: string;
  columns: { name: string; dataType: string | null }[];
}

export interface ConnectionSchema {
  tables: SchemaTable[];
  fetchedAt: number;
}

interface ConnectionEntry {
  schema: ConnectionSchema | null;
  loading: boolean;
  error: string | null;
  /** Active in-flight promise deduped per connection. */
  inflight: Promise<ConnectionSchema | null> | null;
}

function emptyEntry(): ConnectionEntry {
  return { schema: null, loading: false, error: null, inflight: null };
}

function groupEntries(entries: SchemaEntry[]): SchemaTable[] {
  // Key is `${schema ?? ""}\0${table}` so two tables with the same name in
  // different schemas don't collide (e.g. `public.users` vs `auth.users`).
  const byKey = new Map<
    string,
    { schema: string | null; name: string; columns: { name: string; dataType: string | null }[] }
  >();
  for (const entry of entries) {
    const schema = entry.schema_name ?? null;
    const key = `${schema ?? ""}\0${entry.table_name}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.columns.push({ name: entry.column_name, dataType: entry.data_type });
    } else {
      byKey.set(key, {
        schema,
        name: entry.table_name,
        columns: [{ name: entry.column_name, dataType: entry.data_type }],
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    const sa = a.schema ?? "";
    const sb = b.schema ?? "";
    if (sa !== sb) return sa.localeCompare(sb);
    return a.name.localeCompare(b.name);
  });
}

interface SchemaCacheState {
  byConnection: Record<string, ConnectionEntry>;

  /** Sync read — returns the cached schema if already loaded, else null. */
  get: (connectionId: string) => ConnectionSchema | null;
  /** Ensure schema is loaded; reads SQLite cache first, introspects on miss. */
  ensureLoaded: (connectionId: string) => Promise<ConnectionSchema | null>;
  /** Force a fresh introspection, bypassing the SQLite cache. */
  refresh: (connectionId: string) => Promise<ConnectionSchema | null>;
  /** Drop a connection's cached schema — e.g. when the connection is deleted. */
  invalidate: (connectionId: string) => void;
}

export const useSchemaCacheStore = create<SchemaCacheState>()(
  devtools(
    (set, get) => ({
      byConnection: {},

      get: (connectionId) => {
        const entry = get().byConnection[connectionId];
        return entry?.schema ?? null;
      },

      ensureLoaded: async (connectionId) => {
        const state = get().byConnection[connectionId];
        if (state?.schema) return state.schema;
        if (state?.inflight) return state.inflight;

        const promise = (async (): Promise<ConnectionSchema | null> => {
          try {
            const cached = await getCachedSchema(connectionId, 300);
            if (cached && cached.length > 0) {
              return { tables: groupEntries(cached), fetchedAt: Date.now() };
            }
            const fresh = await introspectSchema(connectionId);
            return { tables: groupEntries(fresh), fetchedAt: Date.now() };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            set((s) => ({
              byConnection: {
                ...s.byConnection,
                [connectionId]: {
                  ...(s.byConnection[connectionId] ?? emptyEntry()),
                  error: message,
                  loading: false,
                  inflight: null,
                },
              },
            }));
            return null;
          }
        })();

        set((s) => ({
          byConnection: {
            ...s.byConnection,
            [connectionId]: {
              ...(s.byConnection[connectionId] ?? emptyEntry()),
              loading: true,
              error: null,
              inflight: promise,
            },
          },
        }));

        const schema = await promise;
        set((s) => ({
          byConnection: {
            ...s.byConnection,
            [connectionId]: {
              ...(s.byConnection[connectionId] ?? emptyEntry()),
              schema,
              loading: false,
              inflight: null,
            },
          },
        }));
        return schema;
      },

      refresh: async (connectionId) => {
        const existing = get().byConnection[connectionId];
        if (existing?.inflight) return existing.inflight;

        const promise = (async (): Promise<ConnectionSchema | null> => {
          try {
            const fresh = await introspectSchema(connectionId);
            return { tables: groupEntries(fresh), fetchedAt: Date.now() };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            set((s) => ({
              byConnection: {
                ...s.byConnection,
                [connectionId]: {
                  ...(s.byConnection[connectionId] ?? emptyEntry()),
                  error: message,
                  loading: false,
                  inflight: null,
                },
              },
            }));
            return null;
          }
        })();

        set((s) => ({
          byConnection: {
            ...s.byConnection,
            [connectionId]: {
              ...(s.byConnection[connectionId] ?? emptyEntry()),
              loading: true,
              error: null,
              inflight: promise,
            },
          },
        }));

        const schema = await promise;
        set((s) => ({
          byConnection: {
            ...s.byConnection,
            [connectionId]: {
              ...(s.byConnection[connectionId] ?? emptyEntry()),
              schema,
              loading: false,
              inflight: null,
            },
          },
        }));
        return schema;
      },

      invalidate: (connectionId) => {
        set((s) => {
          const next = { ...s.byConnection };
          delete next[connectionId];
          return { byConnection: next };
        });
      },
    }),
    { name: "schema-cache-store" },
  ),
);
