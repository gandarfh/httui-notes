export interface DbBlockData {
  connectionId: string;
  query: string;
  timeoutMs?: number;
}

export const DEFAULT_DB_DATA: DbBlockData = {
  connectionId: "",
  query: "",
};

export type CellValue =
  | string
  | number
  | boolean
  | null
  | CellValue[]
  | { [key: string]: CellValue };

export interface DbSelectResponse {
  columns: { name: string; type: string }[];
  rows: Record<string, CellValue>[];
  has_more: boolean;
}

export interface DbMutationResponse {
  rows_affected: number;
}

export type DbResponse = DbSelectResponse | DbMutationResponse;

export function isSelectResponse(data: DbResponse): data is DbSelectResponse {
  return "columns" in data;
}
