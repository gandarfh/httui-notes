import { invoke } from "@tauri-apps/api/core";

export interface Connection {
  id: string;
  name: string;
  driver: "postgres" | "mysql" | "sqlite";
  host: string | null;
  port: number | null;
  database_name: string | null;
  username: string | null;
  password: string | null;
  ssl_mode: string | null;
  timeout_ms: number;
  query_timeout_ms: number;
  ttl_seconds: number;
  max_pool_size: number;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionInput {
  name: string;
  driver: "postgres" | "mysql" | "sqlite";
  host?: string;
  port?: number;
  database_name?: string;
  username?: string;
  password?: string;
  ssl_mode?: string;
  timeout_ms?: number;
  query_timeout_ms?: number;
  ttl_seconds?: number;
  max_pool_size?: number;
}

export interface UpdateConnectionInput {
  name?: string;
  driver?: string;
  host?: string;
  port?: number;
  database_name?: string;
  username?: string;
  password?: string;
  ssl_mode?: string;
  timeout_ms?: number;
  query_timeout_ms?: number;
  ttl_seconds?: number;
  max_pool_size?: number;
}

export function listConnections(): Promise<Connection[]> {
  return invoke("list_connections");
}

export function createConnection(
  input: CreateConnectionInput,
): Promise<Connection> {
  return invoke("create_connection", { input });
}

export function updateConnection(
  id: string,
  input: UpdateConnectionInput,
): Promise<Connection> {
  return invoke("update_connection", { id, input });
}

export function deleteConnection(id: string): Promise<void> {
  return invoke("delete_connection", { id });
}

export function testConnection(id: string): Promise<void> {
  return invoke("test_connection", { id });
}

// --- Schema introspection ---

export interface SchemaEntry {
  table_name: string;
  column_name: string;
  data_type: string | null;
}

export function introspectSchema(
  connectionId: string,
): Promise<SchemaEntry[]> {
  return invoke("introspect_schema", { connectionId });
}

export function getCachedSchema(
  connectionId: string,
  ttlSeconds?: number,
): Promise<SchemaEntry[] | null> {
  return invoke("get_cached_schema", { connectionId, ttlSeconds });
}
