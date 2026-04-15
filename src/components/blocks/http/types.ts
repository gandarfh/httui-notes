export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface KeyValue {
  key: string;
  value: string;
}

export type HttpHeader = KeyValue;
export type HttpParam = KeyValue;

export interface HttpBlockData {
  method: HttpMethod;
  url: string;
  params: HttpParam[];
  headers: HttpHeader[];
  body: string;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  elapsedMs: number;
}

export const DEFAULT_HTTP_DATA: HttpBlockData = {
  method: "GET",
  url: "",
  params: [],
  headers: [],
  body: "",
};
