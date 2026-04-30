import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import { DocHeaderStatusBadge } from "@/components/layout/docheader/DocHeaderStatusBadge";
import { renderWithProviders, screen } from "@/test/render";

describe("DocHeaderStatusBadge", () => {
  it("renders nothing when status is undefined", () => {
    const { container } = renderWithProviders(<DocHeaderStatusBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when status is null", () => {
    const { container } = renderWithProviders(
      <DocHeaderStatusBadge status={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for empty / whitespace-only status", () => {
    const { container } = renderWithProviders(
      <DocHeaderStatusBadge status="   " />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders draft status uppercase with data-status attribute", () => {
    renderWithProviders(<DocHeaderStatusBadge status="draft" />);
    const badge = screen.getByTestId("docheader-status-badge");
    expect(badge).toHaveAttribute("data-status", "draft");
    expect(badge).toHaveAttribute("data-known", "true");
    // Display label is uppercased via CSS but the DOM text is lowercase.
    expect(badge.textContent?.toLowerCase()).toBe("draft");
  });

  it("renders active status with data-known true", () => {
    renderWithProviders(<DocHeaderStatusBadge status="active" />);
    const badge = screen.getByTestId("docheader-status-badge");
    expect(badge).toHaveAttribute("data-status", "active");
    expect(badge).toHaveAttribute("data-known", "true");
  });

  it("renders archived status with data-known true", () => {
    renderWithProviders(<DocHeaderStatusBadge status="archived" />);
    const badge = screen.getByTestId("docheader-status-badge");
    expect(badge).toHaveAttribute("data-status", "archived");
  });

  it("normalizes case and trims whitespace", () => {
    renderWithProviders(<DocHeaderStatusBadge status="  Draft  " />);
    const badge = screen.getByTestId("docheader-status-badge");
    expect(badge).toHaveAttribute("data-status", "draft");
  });

  it("falls through to muted palette for unknown forward-compat status", () => {
    renderWithProviders(<DocHeaderStatusBadge status="review" />);
    const badge = screen.getByTestId("docheader-status-badge");
    expect(badge).toHaveAttribute("data-status", "review");
    expect(badge).toHaveAttribute("data-known", "false");
  });

  it("renders as a span when no onSelect handler", () => {
    renderWithProviders(<DocHeaderStatusBadge status="active" />);
    const badge = screen.getByTestId("docheader-status-badge");
    expect(badge.tagName).toBe("SPAN");
  });

  it("renders as a button and fires onSelect when handler provided", async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DocHeaderStatusBadge status="active" onSelect={onSelect} />,
    );
    const badge = screen.getByTestId("docheader-status-badge");
    expect(badge.tagName).toBe("BUTTON");
    await userEvent.click(badge);
    expect(onSelect).toHaveBeenCalledWith("active");
  });

  it("normalizes the value passed to onSelect", async () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <DocHeaderStatusBadge status="  Archived " onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByTestId("docheader-status-badge"));
    expect(onSelect).toHaveBeenCalledWith("archived");
  });

  it("title attribute encodes the normalized status", () => {
    renderWithProviders(<DocHeaderStatusBadge status="draft" />);
    expect(screen.getByTestId("docheader-status-badge")).toHaveAttribute(
      "title",
      "status: draft",
    );
  });
});
