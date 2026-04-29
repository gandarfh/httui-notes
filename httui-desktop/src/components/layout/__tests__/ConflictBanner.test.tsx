import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { ConflictBanner } from "@/components/layout/ConflictBanner";

describe("ConflictBanner", () => {
  it("renders just the file name from a nested path", () => {
    renderWithProviders(
      <ConflictBanner
        filePath="folder/sub/notes.md"
        onReload={vi.fn()}
        onKeep={vi.fn()}
      />,
    );

    expect(screen.getByText(/notes\.md was modified externally/)).toBeInTheDocument();
    expect(screen.queryByText(/folder\/sub/)).not.toBeInTheDocument();
  });

  it("renders the full name when path has no slashes", () => {
    renderWithProviders(
      <ConflictBanner
        filePath="root.md"
        onReload={vi.fn()}
        onKeep={vi.fn()}
      />,
    );

    expect(screen.getByText(/root\.md was modified externally/)).toBeInTheDocument();
  });

  it("calls onReload when 'Reload' is clicked", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    const onKeep = vi.fn();

    renderWithProviders(
      <ConflictBanner
        filePath="x.md"
        onReload={onReload}
        onKeep={onKeep}
      />,
    );

    await user.click(screen.getByRole("button", { name: /reload/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("calls onKeep when 'Keep Mine' is clicked", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    const onKeep = vi.fn();

    renderWithProviders(
      <ConflictBanner
        filePath="x.md"
        onReload={onReload}
        onKeep={onKeep}
      />,
    );

    await user.click(screen.getByRole("button", { name: /keep mine/i }));
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });
});
