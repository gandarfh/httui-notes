// Canvas §5 connection-kind metadata — Epic 42 Story 01.
//
// Single source of truth for the 9 supported kinds: name, icon
// glyph, accent hue. Consumed by `<ConnectionKindIcon>`,
// `<ConnectionKindFilter>` (sidebar), and the list-row icon column.

export type ConnectionKind =
  | "postgres"
  | "mysql"
  | "mongo"
  | "bigquery"
  | "grpc"
  | "graphql"
  | "http"
  | "ws"
  | "shell";

export interface ConnectionKindMeta {
  kind: ConnectionKind;
  label: string;
  icon: string;
  /** oklch lightness/chroma/hue triple (no `oklch()` wrapper). */
  hue: string;
}

export const CONNECTION_KINDS: Readonly<
  Record<ConnectionKind, ConnectionKindMeta>
> = {
  postgres: {
    kind: "postgres",
    label: "PostgreSQL",
    icon: "🐘",
    hue: "0.62 0.10 250",
  },
  mysql: {
    kind: "mysql",
    label: "MySQL / MariaDB",
    icon: "🐬",
    hue: "0.62 0.10 215",
  },
  mongo: {
    kind: "mongo",
    label: "MongoDB",
    icon: "🍃",
    hue: "0.55 0.13 145",
  },
  bigquery: {
    kind: "bigquery",
    label: "BigQuery",
    icon: "📊",
    hue: "0.62 0.10 240",
  },
  grpc: {
    kind: "grpc",
    label: "gRPC",
    icon: "⚡",
    hue: "0.62 0.14 280",
  },
  graphql: {
    kind: "graphql",
    label: "GraphQL",
    icon: "◆",
    hue: "0.62 0.16 330",
  },
  http: {
    kind: "http",
    label: "HTTP / REST base URL",
    icon: "🌐",
    hue: "0.74 0.07 215",
  },
  ws: {
    kind: "ws",
    label: "WebSocket",
    icon: "↔",
    hue: "0.62 0.10 215",
  },
  shell: {
    kind: "shell",
    label: "Shell / Bash",
    icon: "▷",
    hue: "0.50 0.014 240",
  },
};

/** Stable display order for the sidebar filter list. */
export const CONNECTION_KIND_ORDER: ReadonlyArray<ConnectionKind> = [
  "postgres",
  "mysql",
  "mongo",
  "bigquery",
  "grpc",
  "graphql",
  "http",
  "ws",
  "shell",
];

/** `oklch(hue)` wrapper — convenience for inline style consumers. */
export function kindColor(kind: ConnectionKind): string {
  return `oklch(${CONNECTION_KINDS[kind].hue})`;
}
