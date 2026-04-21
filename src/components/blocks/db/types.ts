export interface DbBlockData {
  connectionId: string;
  query: string;
  timeoutMs?: number;
}

export const DEFAULT_DB_DATA: DbBlockData = {
  connectionId: "",
  query: "",
};

export interface DbSelectResponse {
  columns: { name: string; type: string }[];
  rows: Record<string, string | number | boolean | null>[];
  has_more: boolean;
}

export interface DbMutationResponse {
  rows_affected: number;
}

export type DbResponse = DbSelectResponse | DbMutationResponse;

export function isSelectResponse(data: DbResponse): data is DbSelectResponse {
  return "columns" in data;
}
