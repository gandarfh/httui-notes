import type { HttpMethod, KeyValue } from "../http/types";

export interface E2eExtraction {
  name: string;
  path: string;
}

export interface E2eExpect {
  status?: number;
  json: KeyValue[];
  bodyContains: string[];
}

export interface E2eStep {
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  body: string;
  expect: E2eExpect;
  extract: E2eExtraction[];
}

export interface E2eBlockData {
  baseUrl: string;
  headers: KeyValue[];
  steps: E2eStep[];
}

export interface E2eStepResult {
  name: string;
  passed: boolean;
  errors: string[];
  status_code: number;
  elapsed_ms: number;
  response_body: unknown;
  extractions: Record<string, unknown>;
}

export interface E2eResult {
  passed: number;
  total: number;
  steps: E2eStepResult[];
}

export const DEFAULT_E2E_DATA: E2eBlockData = {
  baseUrl: "",
  headers: [],
  steps: [],
};

export const DEFAULT_STEP: E2eStep = {
  name: "",
  method: "GET",
  url: "",
  headers: [],
  body: "",
  expect: { json: [], bodyContains: [] },
  extract: [],
};
