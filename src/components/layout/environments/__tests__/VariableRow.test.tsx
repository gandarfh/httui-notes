import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { VariableRow } from "@/components/layout/environments/VariableRow";
import type { EnvVariable } from "@/lib/tauri/commands";

const mkVar = (over: Partial<EnvVariable> = {}): EnvVariable => ({
  id: "v1",
  environment_id: "e1",
  key: "TOKEN",
  value: "abc123",
  is_secret: false,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("VariableRow", () => {
  it("renders the key and a plain value when not secret", () => {
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );
    expect(screen.getByText("TOKEN")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("masks the value when secret and not revealed", () => {
    renderWithProviders(
      <VariableRow
        variable={mkVar({ is_secret: true })}
        revealed={false}
        isLast={true}
        onSave={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );
    expect(screen.queryByText("abc123")).not.toBeInTheDocument();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("shows secret value when revealed", () => {
    renderWithProviders(
      <VariableRow
        variable={mkVar({ is_secret: true })}
        revealed={true}
        isLast={true}
        onSave={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("clicking the value enters edit mode and pre-fills input", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );

    await user.click(screen.getByText("abc123"));
    expect(screen.getByDisplayValue("abc123")).toBeInTheDocument();
  });

  it("Enter saves the new value and exits edit mode", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={onSave}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );

    await user.click(screen.getByText("abc123"));
    const input = screen.getByDisplayValue("abc123");
    await user.clear(input);
    await user.type(input, "new-value{Enter}");

    expect(onSave).toHaveBeenCalledWith("new-value", false);
  });

  it("Escape cancels edit and reverts the value", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={onSave}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );

    await user.click(screen.getByText("abc123"));
    const input = screen.getByDisplayValue("abc123");
    await user.clear(input);
    await user.type(input, "discarded{Escape}");

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("does not call onSave when value is unchanged on blur", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={onSave}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );

    await user.click(screen.getByText("abc123"));
    screen.getByDisplayValue("abc123");
    // Blur via click outside
    await user.click(document.body);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("clicking the lock toggles is_secret via onSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => {});
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={onSave}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /mark as secret/i }));
    expect(onSave).toHaveBeenCalledWith("abc123", true);
  });

  it("reveal toggle is hidden for plain (non-secret) values", () => {
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /show value|hide value/i }),
    ).not.toBeInTheDocument();
  });

  it("reveal toggle calls onToggleReveal when secret", async () => {
    const user = userEvent.setup();
    const onToggleReveal = vi.fn();
    renderWithProviders(
      <VariableRow
        variable={mkVar({ is_secret: true })}
        revealed={false}
        isLast={true}
        onSave={vi.fn(async () => {})}
        onDelete={vi.fn(async () => {})}
        onToggleReveal={onToggleReveal}
      />,
    );

    await user.click(screen.getByRole("button", { name: /show value/i }));
    expect(onToggleReveal).toHaveBeenCalled();
  });

  it("clicking delete invokes onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn(async () => {});
    renderWithProviders(
      <VariableRow
        variable={mkVar()}
        revealed={false}
        isLast={true}
        onSave={vi.fn(async () => {})}
        onDelete={onDelete}
        onToggleReveal={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete variable/i }));
    expect(onDelete).toHaveBeenCalled();
  });
});
