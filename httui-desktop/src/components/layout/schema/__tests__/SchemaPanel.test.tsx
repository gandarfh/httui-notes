import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaPanel } from "@/components/layout/schema/SchemaPanel";
import { usePaneStore } from "@/stores/pane";
import { useSchemaCacheStore } from "@/stores/schemaCache";
import { clearTauriMocks, mockTauriCommand } from "@/test/mocks/tauri";
import { renderWithProviders, screen } from "@/test/render";

vi.mock("@/lib/codemirror/active-editor", () => ({
  insertDbSnippetIntoActiveEditor: vi.fn(() => true),
}));

beforeEach(() => {
  clearTauriMocks();
  // Reset stores to a clean baseline.
  usePaneStore.setState({
    activePaneId: "p1",
    layout: {
      type: "leaf",
      id: "p1",
      tabs: [],
      activeTab: 0,
    } as never,
    editorContents: new Map(),
    unsavedFiles: new Set<string>(),
  } as never);
  useSchemaCacheStore.setState({ byConnection: {} } as never);
});

afterEach(() => {
  clearTauriMocks();
});

const fakeConnections = [
  {
    id: "id-alpha",
    name: "alpha-db",
    driver: "sqlite",
    host: null,
    port: null,
    database_name: ":memory:",
    username: null,
    password: null,
    ssl_mode: null,
    timeout_ms: 10_000,
    query_timeout_ms: 30_000,
    ttl_seconds: 300,
    max_pool_size: 5,
    is_readonly: false,
    last_tested_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "id-payments",
    name: "payments-db",
    driver: "postgres",
    host: "localhost",
    port: 5432,
    database_name: "pay",
    username: "admin",
    password: "__KEYCHAIN__",
    ssl_mode: "disable",
    timeout_ms: 10_000,
    query_timeout_ms: 30_000,
    ttl_seconds: 300,
    max_pool_size: 5,
    is_readonly: false,
    last_tested_at: null,
    created_at: "",
    updated_at: "",
  },
];

function setActiveFile(filePath: string, content: string) {
  usePaneStore.setState({
    activePaneId: "p1",
    layout: {
      type: "leaf",
      id: "p1",
      tabs: [
        {
          kind: "file",
          filePath,
          vaultPath: "/v",
          unsaved: false,
        } as never,
      ],
      activeTab: 0,
    } as never,
    editorContents: new Map([[filePath, content]]),
    unsavedFiles: new Set<string>(),
  } as never);
}

describe("SchemaPanel — connection auto-pick", () => {
  it("falls back to the first connection when the active doc has no db blocks", async () => {
    mockTauriCommand("list_connections", () => fakeConnections);
    setActiveFile("plain.md", "# heading\n\nplain text\n");
    renderWithProviders(<SchemaPanel width={300} onClose={() => {}} />);
    // Wait for the effect to land. The native select shows one
    // <option> per connection; the picked one becomes the value.
    const select = (await screen.findByRole(
      "combobox",
    )) as HTMLSelectElement;
    await vi.waitFor(() => {
      expect(select.value).toBe("id-alpha");
    });
  });

  it("picks the connection matching the doc's most-recent db block", async () => {
    mockTauriCommand("list_connections", () => fakeConnections);
    setActiveFile(
      "runbook.md",
      [
        "# Payments runbook",
        "",
        "```db-postgres connection=alpha-db",
        "select 1;",
        "```",
        "",
        "```db-postgres connection=payments-db",
        "select count(*) from charges;",
        "```",
        "",
      ].join("\n"),
    );
    renderWithProviders(<SchemaPanel width={300} onClose={() => {}} />);
    const select = (await screen.findByRole(
      "combobox",
    )) as HTMLSelectElement;
    await vi.waitFor(() => {
      // The most-recent block specifies `payments-db`; expect that
      // connection's id to be selected, not the first list entry.
      expect(select.value).toBe("id-payments");
    });
  });

  it("falls back to first connection when the doc names a connection that's not in the list", async () => {
    mockTauriCommand("list_connections", () => fakeConnections);
    setActiveFile(
      "ghost.md",
      "```db-postgres connection=ghost-db\nselect 1\n```\n",
    );
    renderWithProviders(<SchemaPanel width={300} onClose={() => {}} />);
    const select = (await screen.findByRole(
      "combobox",
    )) as HTMLSelectElement;
    await vi.waitFor(() => {
      // ghost-db isn't in the connections list → fallback is the
      // first one, alpha-db.
      expect(select.value).toBe("id-alpha");
    });
  });

  it("renders nothing problematic when the connections list is empty", async () => {
    mockTauriCommand("list_connections", () => []);
    setActiveFile("file.md", "body\n");
    renderWithProviders(<SchemaPanel width={300} onClose={() => {}} />);
    // No throw, the panel chrome still renders.
    expect(await screen.findByLabelText("Close schema panel")).toBeInTheDocument();
  });
});
