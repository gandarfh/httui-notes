import { invoke } from "@tauri-apps/api/core";

export interface AuditColumn {
  name: string;
  type: string;
}

export interface AuditQueryResult {
  columns: AuditColumn[];
  rows: unknown[][];
  has_more: boolean;
}

export function queryInternalDb(
  query: string,
  offset: number,
  fetchSize: number,
): Promise<AuditQueryResult> {
  return invoke("query_internal_db", { query, offset, fetchSize });
}
