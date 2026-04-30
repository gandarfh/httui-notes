// Canvas §6 Variables — scope metadata (Epic 43 Story 01).
//
// Five scopes per canvas: Todas (all), Workspace, Capturadas (captured
// from runs), Secrets (keychain-backed), Pessoais (per-user). The
// sidebar lists them with a glyph + count + hue; the value resolution
// chain itself ("bloco → env → workspace → secret") lives in the
// list-panel subtitle.

export const VARIABLE_SCOPES = [
  "all",
  "workspace",
  "captured",
  "secret",
  "personal",
] as const;

export type VariableScope = (typeof VARIABLE_SCOPES)[number];

export interface VariableScopeMeta {
  id: VariableScope;
  /** Human label rendered in the sidebar row. */
  label: string;
  /** Single-glyph icon (canvas spec). */
  glyph: string;
  /** Localised tooltip-style hint. */
  hint: string;
}

export const VARIABLE_SCOPE_META: Record<VariableScope, VariableScopeMeta> = {
  all: {
    id: "all",
    label: "Todas",
    glyph: "✱",
    hint: "Todas as variáveis do vault.",
  },
  workspace: {
    id: "workspace",
    label: "Workspace",
    glyph: "🌐",
    hint: "Definidas em envs/*.toml — versionadas com o vault.",
  },
  captured: {
    id: "captured",
    label: "Capturadas",
    glyph: "↩",
    hint: "Geradas por blocos (`{{alias.body.x}}`) durante execuções.",
  },
  secret: {
    id: "secret",
    label: "Secrets",
    glyph: "🔒",
    hint: "Valor vive no keychain — nunca em arquivo.",
  },
  personal: {
    id: "personal",
    label: "Pessoais",
    glyph: "👤",
    hint: "Sua conta — não saem dessa máquina.",
  },
};

/** Resolution chain rendered as the list-panel subtitle. */
export const VAR_RESOLUTION_HINT =
  "resolução: bloco → env → workspace → secret";

/** Helpers panel shown below the scopes in the sidebar. */
export const VARIABLE_HELPERS: ReadonlyArray<{
  syntax: string;
  hint: string;
}> = [
  { syntax: "{{uuid()}}", hint: "UUID v4 fresco a cada chamada" },
  { syntax: "{{now()}}", hint: "ISO-8601 do momento da execução" },
  { syntax: "{{base64(x)}}", hint: "base64 de x" },
  { syntax: "{{$prev.body.id}}", hint: "captura do bloco imediatamente acima" },
];
