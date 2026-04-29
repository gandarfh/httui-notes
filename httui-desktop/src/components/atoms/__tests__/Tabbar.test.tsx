import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { Tabbar } from "@/components/atoms";

const TABS = [
  { id: "outline", label: "Outline" },
  { id: "schema", label: "Schema" },
  { id: "history", label: "History" },
];

describe("Tabbar atom", () => {
  it("renders one role=tab per item", () => {
    renderWithProviders(
      <Tabbar tabs={TABS} activeId="outline" onSelect={() => {}} />,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("marks the active tab with aria-selected + data-active='true'", () => {
    renderWithProviders(
      <Tabbar tabs={TABS} activeId="schema" onSelect={() => {}} />,
    );
    const schema = screen.getByRole("tab", { name: "Schema" });
    expect(schema.getAttribute("aria-selected")).toBe("true");
    expect(schema.getAttribute("data-active")).toBe("true");

    const outline = screen.getByRole("tab", { name: "Outline" });
    expect(outline.getAttribute("aria-selected")).toBe("false");
    expect(outline.getAttribute("data-active")).toBe("false");
  });

  it("dispatches onSelect with the tab id when clicked", async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <Tabbar tabs={TABS} activeId="outline" onSelect={onSelect} />,
    );
    await userEvent.setup().click(screen.getByRole("tab", { name: "History" }));
    expect(onSelect).toHaveBeenCalledWith("history");
  });

  it("supports null activeId (no tab selected)", () => {
    renderWithProviders(
      <Tabbar tabs={TABS} activeId={null} onSelect={() => {}} />,
    );
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("renders an empty tablist when given no tabs", () => {
    renderWithProviders(
      <Tabbar tabs={[]} activeId={null} onSelect={() => {}} />,
    );
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
