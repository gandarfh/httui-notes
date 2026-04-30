import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

import {
  PreflightPills,
  type PreflightPillItem,
} from "@/components/blocks/preflight/PreflightPills";
import { renderWithProviders, screen } from "@/test/render";

function pass(id: string, label = id): PreflightPillItem {
  return { id, label, result: { outcome: "pass" } };
}

function fail(
  id: string,
  reason: string,
  suggestion?: string,
): PreflightPillItem {
  return {
    id,
    label: id,
    result: { outcome: "fail", reason },
    suggestion,
  };
}

function skip(id: string, reason: string): PreflightPillItem {
  return { id, label: id, result: { outcome: "skip", reason } };
}

describe("PreflightPills", () => {
  it("renders nothing when items is empty", () => {
    const { container } = renderWithProviders(<PreflightPills items={[]} />);
    expect(container.querySelector('[data-testid="preflight-pills"]'))
      .toBeNull();
  });

  it("renders one pill per item with the right data-kind", () => {
    renderWithProviders(
      <PreflightPills
        items={[
          pass("a"),
          fail("b", "missing"),
          skip("c", "irrelevant"),
        ]}
      />,
    );
    expect(
      screen.getByTestId("preflight-pills").getAttribute("data-count"),
    ).toBe("3");
    expect(
      screen.getByTestId("preflight-pill-a").getAttribute("data-kind"),
    ).toBe("pass");
    expect(
      screen.getByTestId("preflight-pill-b").getAttribute("data-kind"),
    ).toBe("fail");
    expect(
      screen.getByTestId("preflight-pill-c").getAttribute("data-kind"),
    ).toBe("skip");
  });

  it("renders the canvas glyphs (✓ ✗ –)", () => {
    renderWithProviders(
      <PreflightPills
        items={[pass("a"), fail("b", "x"), skip("c", "y")]}
      />,
    );
    expect(screen.getByTestId("preflight-pill-a-glyph").textContent).toBe(
      "✓",
    );
    expect(screen.getByTestId("preflight-pill-b-glyph").textContent).toBe(
      "✗",
    );
    expect(screen.getByTestId("preflight-pill-c-glyph").textContent).toBe(
      "–",
    );
  });

  it("flips all pills to 'running' when rechecking is true", () => {
    renderWithProviders(
      <PreflightPills
        items={[pass("a"), fail("b", "x")]}
        rechecking
      />,
    );
    expect(
      screen.getByTestId("preflight-pill-a").getAttribute("data-kind"),
    ).toBe("running");
    expect(
      screen.getByTestId("preflight-pill-b").getAttribute("data-kind"),
    ).toBe("running");
    expect(screen.getByTestId("preflight-pill-a-glyph").textContent).toBe(
      "◌",
    );
  });

  it("makes failed pills actionable only when onSelectFailure is provided", async () => {
    const onSelectFailure = vi.fn();
    renderWithProviders(
      <PreflightPills
        items={[fail("b", "missing", "Add this connection")]}
        onSelectFailure={onSelectFailure}
      />,
    );
    const pill = screen.getByTestId("preflight-pill-b");
    expect(pill.getAttribute("data-actionable")).toBe("true");
    expect(pill.tagName).toBe("BUTTON");
    expect(pill.getAttribute("title")).toMatch(/missing/);
    expect(pill.getAttribute("title")).toMatch(/Add this connection/);
    await userEvent.setup().click(pill);
    expect(onSelectFailure).toHaveBeenCalledTimes(1);
    expect(onSelectFailure.mock.calls[0]![0].id).toBe("b");
  });

  it("renders failed pills as inert spans without the callback", () => {
    renderWithProviders(
      <PreflightPills items={[fail("b", "missing")]} />,
    );
    const pill = screen.getByTestId("preflight-pill-b");
    expect(pill.getAttribute("data-actionable")).toBeNull();
    expect(pill.tagName).toBe("SPAN");
  });

  it("does not make pass / skip pills actionable even with onSelectFailure", () => {
    renderWithProviders(
      <PreflightPills
        items={[pass("a"), skip("c", "irrelevant")]}
        onSelectFailure={() => {}}
      />,
    );
    expect(screen.getByTestId("preflight-pill-a").tagName).toBe("SPAN");
    expect(screen.getByTestId("preflight-pill-c").tagName).toBe("SPAN");
  });

  it("renders the Re-check button when onRecheck is supplied", async () => {
    const onRecheck = vi.fn();
    renderWithProviders(
      <PreflightPills items={[pass("a")]} onRecheck={onRecheck} />,
    );
    const btn = screen.getByTestId("preflight-pills-recheck");
    expect(btn.textContent).toBe("Re-check");
    await userEvent.setup().click(btn);
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it("disables Re-check + flips its label while rechecking", () => {
    renderWithProviders(
      <PreflightPills
        items={[pass("a")]}
        onRecheck={() => {}}
        rechecking
      />,
    );
    const btn = screen.getByTestId(
      "preflight-pills-recheck",
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("Re-checking…");
  });

  it("hides the Re-check button when no callback is supplied", () => {
    renderWithProviders(<PreflightPills items={[pass("a")]} />);
    expect(
      screen.queryByTestId("preflight-pills-recheck"),
    ).not.toBeInTheDocument();
  });

  it("title includes only reason when no suggestion", () => {
    renderWithProviders(
      <PreflightPills
        items={[fail("b", "Connection x not found")]}
        onSelectFailure={() => {}}
      />,
    );
    expect(
      screen.getByTestId("preflight-pill-b").getAttribute("title"),
    ).toBe("Connection x not found");
  });
});
