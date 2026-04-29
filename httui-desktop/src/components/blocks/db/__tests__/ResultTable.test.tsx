import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, within } from "@/test/render";
import userEvent from "@testing-library/user-event";

// Bypass virtualizer in jsdom (no real layout) — render every row as if visible.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    const items = Array.from({ length: count }, (_, index) => ({
      index,
      start: index * 32,
      end: (index + 1) * 32,
      size: 32,
      key: index,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * 32,
    };
  },
}));

import { ResultTable } from "@/components/blocks/db/ResultTable";

const cols = [
  { name: "id", type: "int" },
  { name: "name", type: "text" },
  { name: "data", type: "json" },
];

const rows = [
  { id: 1, name: "alice", data: '{"role":"admin"}' },
  { id: 2, name: "bob", data: null },
  { id: 3, name: null, data: { nested: true } },
];

describe("ResultTable", () => {
  beforeEach(() => {
    // jsdom does not implement scrollTo / clipboard well — give them stubs
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => {}) },
      configurable: true,
    });
  });

  it("renders 'No columns returned' when columns array is empty", () => {
    renderWithProviders(
      <ResultTable columns={[]} rows={[]} hasMore={false} />,
    );
    expect(screen.getByText("No columns returned")).toBeInTheDocument();
  });

  it("renders 'No rows returned' when rows is empty but columns exist", () => {
    renderWithProviders(
      <ResultTable columns={cols} rows={[]} hasMore={false} />,
    );
    expect(screen.getByText("No rows returned")).toBeInTheDocument();
  });

  it("renders column headers with name + type label", () => {
    renderWithProviders(
      <ResultTable columns={cols} rows={rows} hasMore={false} />,
    );

    const idHeader = screen.getByTitle("id (int)");
    expect(within(idHeader).getByText("id")).toBeInTheDocument();
    expect(within(idHeader).getByText("int")).toBeInTheDocument();
  });

  it("renders cell values for each column (formatting NULL, JSON, primitives)", () => {
    renderWithProviders(
      <ResultTable columns={cols} rows={rows} hasMore={false} />,
    );

    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
    expect(screen.getAllByText("bob").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NULL").length).toBeGreaterThan(0);
    // JSON object cell shown as JSON.stringify
    expect(screen.getByText('{"nested":true}')).toBeInTheDocument();
  });

  it("renders the duration footer when durationMs is provided", () => {
    renderWithProviders(
      <ResultTable
        columns={cols}
        rows={rows}
        hasMore={false}
        durationMs={42}
      />,
    );

    // 'rows' label and elapsed are unique to the footer
    expect(screen.getByText("rows")).toBeInTheDocument();
    expect(screen.getByText("42ms")).toBeInTheDocument();
    // row count shown as toLocaleString — 3 rows; appears multiple times (cell + footer), so just check at least once
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  it("formats elapsed in seconds when ≥ 1000 ms", () => {
    renderWithProviders(
      <ResultTable
        columns={cols}
        rows={rows}
        hasMore={false}
        durationMs={2500}
      />,
    );

    expect(screen.getByText("2.50s")).toBeInTheDocument();
  });

  it("uses singular 'row' when count is 1", () => {
    renderWithProviders(
      <ResultTable
        columns={cols}
        rows={[rows[0]]}
        hasMore={false}
        durationMs={5}
      />,
    );

    expect(screen.getByText("row")).toBeInTheDocument();
    expect(screen.queryByText("rows")).not.toBeInTheDocument();
  });

  it("expands a row on click and shows row detail header", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResultTable columns={cols} rows={rows} hasMore={false} />,
    );

    // Find the row containing 'alice' — click it
    const aliceCell = screen.getAllByText("alice")[0];
    const rowEl = aliceCell.closest("tr");
    expect(rowEl).not.toBeNull();
    await user.click(rowEl!);

    // After expand, "Row 1" badge appears
    expect(screen.getByText(/Row 1/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy row as json/i }),
    ).toBeInTheDocument();
  });

  it("clicking 'Close row' collapses the expanded row", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ResultTable columns={cols} rows={rows} hasMore={false} />,
    );

    const aliceCell = screen.getAllByText("alice")[0];
    await user.click(aliceCell.closest("tr")!);
    expect(screen.getByText(/Row 1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close row/i }));
    expect(screen.queryByText(/Row 1/)).not.toBeInTheDocument();
  });

  it("clicking 'Copy row as JSON' calls clipboard.writeText with the row payload", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderWithProviders(
      <ResultTable columns={cols} rows={rows} hasMore={false} />,
    );

    // Expand alice's row
    const aliceCell = screen.getAllByText("alice")[0];
    await user.click(aliceCell.closest("tr")!);

    await user.click(
      screen.getByRole("button", { name: /copy row as json/i }),
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(writeText.mock.calls[0][0]);
    expect(payload).toEqual({ id: 1, name: "alice", data: '{"role":"admin"}' });
  });

  it("uses singular 'field' wording when columns count is 1", async () => {
    const user = userEvent.setup();
    const oneCol = [{ name: "x", type: "text" }];
    const oneRow = [{ x: "y" }];

    renderWithProviders(
      <ResultTable columns={oneCol} rows={oneRow} hasMore={false} />,
    );

    const cell = screen.getAllByText("y")[0];
    await user.click(cell.closest("tr")!);

    expect(screen.getByText(/1 field$/)).toBeInTheDocument();
  });
});
