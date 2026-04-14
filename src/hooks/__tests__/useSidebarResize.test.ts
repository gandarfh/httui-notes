import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSidebarResize } from "../useSidebarResize";

describe("useSidebarResize", () => {
  it("starts with default width of 256", () => {
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(256);
  });

  it("startResize returns a function", () => {
    const { result } = renderHook(() => useSidebarResize());
    expect(typeof result.current.startResize).toBe("function");
  });
});
