import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { DocHeaderMetaStrip } from "@/components/layout/docheader/DocHeaderMetaStrip";
import { renderWithProviders, screen } from "@/test/render";

describe("DocHeaderMetaStrip", () => {
  it("renders the strip element with no chips when no data is provided", () => {
    renderWithProviders(<DocHeaderMetaStrip />);
    expect(screen.getByTestId("docheader-meta-strip")).toBeInTheDocument();
    expect(
      screen.queryByTestId("docheader-meta-author"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("docheader-meta-edited"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("docheader-meta-branch"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("docheader-meta-last-run"),
    ).not.toBeInTheDocument();
  });

  it("renders the author chip with initials and a name+email title", () => {
    renderWithProviders(
      <DocHeaderMetaStrip
        author={{ name: "Jane Doe", email: "jane@x.test" }}
      />,
    );
    const chip = screen.getByTestId("docheader-meta-author");
    expect(chip.textContent).toBe("JD");
    expect(chip.getAttribute("title")).toBe("Jane Doe <jane@x.test>");
  });

  it("renders the edited chip with mtime + dirty flag", () => {
    const tenMinAgo = Date.now() - 10 * 60_000;
    renderWithProviders(
      <DocHeaderMetaStrip mtimeMs={tenMinAgo} dirty />,
    );
    const chip = screen.getByTestId("docheader-meta-edited");
    expect(chip.textContent).toMatch(/Edited 10m ago/);
    expect(chip.textContent).toMatch(/unsaved/);
    expect(chip.getAttribute("data-tone")).toBe("warn");
  });

  it("renders the branch chip with +N ~M", () => {
    renderWithProviders(
      <DocHeaderMetaStrip
        branch={{ branch: "main", addedLines: 5, modifiedLines: 2 }}
      />,
    );
    expect(screen.getByTestId("docheader-meta-branch").textContent).toBe(
      "Branch main +5 ~2",
    );
  });

  it("renders the last-run chip with ok tone when nothing failed", () => {
    renderWithProviders(
      <DocHeaderMetaStrip
        lastRun={{
          ranAt: "2026-05-02T14:32:00Z",
          blockCount: 5,
          failedCount: 0,
        }}
      />,
    );
    const chip = screen.getByTestId("docheader-meta-last-run");
    expect(chip.getAttribute("data-tone")).toBe("ok");
    expect(chip.textContent).toMatch(/Last run/);
  });

  it("renders the last-run chip with fail tone when blocks failed", () => {
    renderWithProviders(
      <DocHeaderMetaStrip
        lastRun={{
          ranAt: "2026-05-02T14:32:00Z",
          blockCount: 5,
          failedCount: 2,
        }}
      />,
    );
    expect(
      screen
        .getByTestId("docheader-meta-last-run")
        .getAttribute("data-tone"),
    ).toBe("fail");
  });

  it("renders chips as buttons when handlers are provided and fires onSelect", async () => {
    const onSelectAuthor = vi.fn();
    const onSelectEdited = vi.fn();
    const onSelectBranch = vi.fn();
    const onSelectLastRun = vi.fn();
    renderWithProviders(
      <DocHeaderMetaStrip
        author={{ name: "X", email: null }}
        mtimeMs={Date.now()}
        branch={{ branch: "main", addedLines: 0, modifiedLines: 0 }}
        lastRun={{
          ranAt: "2026-05-02T14:32:00Z",
          blockCount: 1,
          failedCount: 0,
        }}
        onSelectAuthor={onSelectAuthor}
        onSelectEdited={onSelectEdited}
        onSelectBranch={onSelectBranch}
        onSelectLastRun={onSelectLastRun}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId("docheader-meta-author"));
    await user.click(screen.getByTestId("docheader-meta-edited"));
    await user.click(screen.getByTestId("docheader-meta-branch"));
    await user.click(screen.getByTestId("docheader-meta-last-run"));
    expect(onSelectAuthor).toHaveBeenCalledTimes(1);
    expect(onSelectEdited).toHaveBeenCalledTimes(1);
    expect(onSelectBranch).toHaveBeenCalledTimes(1);
    expect(onSelectLastRun).toHaveBeenCalledTimes(1);
  });

  it("renders chips as inert spans when no handlers are provided", () => {
    renderWithProviders(
      <DocHeaderMetaStrip author={{ name: "X", email: null }} />,
    );
    expect(screen.getByTestId("docheader-meta-author").tagName).toBe("SPAN");
  });

  it("renders the edited chip even when mtimeMs is null (loading state)", () => {
    renderWithProviders(<DocHeaderMetaStrip mtimeMs={null} />);
    expect(
      screen.getByTestId("docheader-meta-edited").textContent,
    ).toMatch(/Not yet saved/);
  });
});
