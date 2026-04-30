import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { UsedInBlocksList } from "@/components/layout/variables/UsedInBlocksList";
import type { VarUseEntry } from "@/lib/tauri/var-uses";
import { renderWithProviders, screen } from "@/test/render";

function entry(file: string, line: number, snippet: string): VarUseEntry {
  return { file_path: file, line, snippet };
}

describe("UsedInBlocksList", () => {
  it("renders the loading hint when loading is true", () => {
    renderWithProviders(<UsedInBlocksList entries={undefined} loading />);
    expect(screen.getByTestId("used-in-blocks-loading")).toBeInTheDocument();
  });

  it("renders the error inline when an error string is supplied", () => {
    renderWithProviders(
      <UsedInBlocksList entries={undefined} error="grep failed" />,
    );
    expect(screen.getByTestId("used-in-blocks-error").textContent).toMatch(
      /grep failed/,
    );
  });

  it("renders the empty hint when entries is undefined", () => {
    renderWithProviders(<UsedInBlocksList entries={undefined} />);
    expect(screen.getByTestId("used-in-blocks-empty")).toBeInTheDocument();
  });

  it("renders the empty hint when entries is an empty array", () => {
    renderWithProviders(<UsedInBlocksList entries={[]} />);
    expect(screen.getByTestId("used-in-blocks-empty")).toBeInTheDocument();
  });

  it("groups hits per file with a count badge", () => {
    renderWithProviders(
      <UsedInBlocksList
        entries={[
          entry("runbook.md", 1, "url: {{API}}"),
          entry("runbook.md", 9, "auth: {{API.body.token}}"),
          entry("ops.md", 3, "{{API}}"),
        ]}
      />,
    );
    expect(
      screen.getByTestId("used-in-blocks-list").getAttribute("data-count"),
    ).toBe("3");
    expect(
      screen.getByTestId("used-in-blocks-file-runbook.md").textContent,
    ).toMatch(/runbook\.md.*\(2\)/);
    expect(
      screen.getByTestId("used-in-blocks-file-ops.md").textContent,
    ).toMatch(/ops\.md.*\(1\)/);
  });

  it("renders one hit row per entry with line number + snippet", () => {
    renderWithProviders(
      <UsedInBlocksList entries={[entry("runbook.md", 7, "url: {{API}}")]} />,
    );
    const hit = screen.getByTestId("used-in-blocks-hit-runbook.md:7");
    expect(hit.textContent).toMatch(/7/);
    expect(hit.textContent).toMatch(/\{\{API\}\}/);
  });

  it("hits are non-interactive (div) when onJump is omitted", () => {
    renderWithProviders(<UsedInBlocksList entries={[entry("a.md", 1, "x")]} />);
    const hit = screen.getByTestId("used-in-blocks-hit-a.md:1");
    expect(hit.tagName).toBe("DIV");
  });

  it("hits become buttons and fire onJump(filePath, line) when clicked", async () => {
    const onJump = vi.fn();
    renderWithProviders(
      <UsedInBlocksList
        entries={[entry("runbook.md", 9, "x")]}
        onJump={onJump}
      />,
    );
    const hit = screen.getByTestId("used-in-blocks-hit-runbook.md:9");
    expect(hit.tagName).toBe("BUTTON");
    await userEvent.setup().click(hit);
    expect(onJump).toHaveBeenCalledWith("runbook.md", 9);
  });
});
