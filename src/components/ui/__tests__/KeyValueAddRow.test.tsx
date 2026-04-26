import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { KeyValueAddRow } from "@/components/ui/KeyValueAddRow";

describe("KeyValueAddRow", () => {
  it("renders default placeholders", () => {
    renderWithProviders(<KeyValueAddRow onAdd={vi.fn()} />);
    expect(screen.getByPlaceholderText("KEY")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("value")).toBeInTheDocument();
  });

  it("supports custom placeholders", () => {
    renderWithProviders(
      <KeyValueAddRow
        onAdd={vi.fn()}
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
      />,
    );
    expect(screen.getByPlaceholderText("Header name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Header value")).toBeInTheDocument();
  });

  it("Add button starts disabled and enables when key has content", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KeyValueAddRow onAdd={vi.fn()} />);
    const addBtn = screen.getByRole("button", { name: /add/i });
    expect(addBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText("KEY"), "TOKEN");
    expect(addBtn).not.toBeDisabled();
  });

  it("Add button stays disabled for whitespace-only keys", async () => {
    const user = userEvent.setup();
    renderWithProviders(<KeyValueAddRow onAdd={vi.fn()} />);
    const addBtn = screen.getByRole("button", { name: /add/i });

    await user.type(screen.getByPlaceholderText("KEY"), "   ");
    expect(addBtn).toBeDisabled();
  });

  it("clicking Add invokes onAdd with trimmed key and raw value, then clears inputs", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithProviders(<KeyValueAddRow onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText("KEY"), "  X  ");
    await user.type(screen.getByPlaceholderText("value"), "v1");
    await user.click(screen.getByRole("button", { name: /add/i }));

    expect(onAdd).toHaveBeenCalledWith("X", "v1");
    expect(screen.getByPlaceholderText("KEY")).toHaveValue("");
    expect(screen.getByPlaceholderText("value")).toHaveValue("");
  });

  it("Enter on key field submits", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithProviders(<KeyValueAddRow onAdd={onAdd} />);

    const key = screen.getByPlaceholderText("KEY");
    await user.type(key, "K{Enter}");

    expect(onAdd).toHaveBeenCalledWith("K", "");
  });

  it("Enter on value field submits", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithProviders(<KeyValueAddRow onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText("KEY"), "K");
    await user.type(screen.getByPlaceholderText("value"), "v{Enter}");

    expect(onAdd).toHaveBeenCalledWith("K", "v");
  });

  it("Enter with empty key does not call onAdd", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithProviders(<KeyValueAddRow onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText("value"), "v{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("awaits async onAdd before clearing inputs", async () => {
    const user = userEvent.setup();
    let resolveAdd: () => void = () => {};
    const onAdd = vi.fn(
      () => new Promise<void>((resolve) => (resolveAdd = resolve)),
    );

    renderWithProviders(<KeyValueAddRow onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText("KEY"), "K");
    await user.click(screen.getByRole("button", { name: /add/i }));

    // Pending — inputs not yet cleared
    expect(screen.getByPlaceholderText("KEY")).toHaveValue("K");

    resolveAdd();
    // Wait one microtask
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByPlaceholderText("KEY")).toHaveValue("");
  });
});
