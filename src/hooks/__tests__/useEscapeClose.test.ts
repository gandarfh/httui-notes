import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEscapeClose } from "../useEscapeClose";

describe("useEscapeClose", () => {
  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose for other keys", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeClose(onClose));
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeClose(onClose));
    unmount();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
