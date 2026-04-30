import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAssertionResult } from "@/hooks/useAssertionResult";
import type { AssertionContext } from "@/lib/blocks/assertions";

const SAMPLE = `GET /

# expect:
# status === 200
# time < 1000`;

describe("useAssertionResult", () => {
  it("returns null when ctx is null (block hasn't run yet)", () => {
    const { result } = renderHook(() => useAssertionResult(SAMPLE, null));
    expect(result.current).toBeNull();
  });

  it("returns null when ctx is undefined", () => {
    const { result } = renderHook(() => useAssertionResult(SAMPLE, undefined));
    expect(result.current).toBeNull();
  });

  it("returns null when the block has no `# expect:` section", () => {
    const ctx: AssertionContext = { status: 200, time_ms: 5 };
    const { result } = renderHook(() => useAssertionResult("GET /\n", ctx));
    expect(result.current).toBeNull();
  });

  it("returns pass=true when every assertion holds", () => {
    const ctx: AssertionContext = { status: 200, time_ms: 50 };
    const { result } = renderHook(() => useAssertionResult(SAMPLE, ctx));
    expect(result.current).toEqual({ pass: true, failures: [] });
  });

  it("returns pass=false with failures when any assertion misses", () => {
    const ctx: AssertionContext = { status: 404, time_ms: 50 };
    const { result } = renderHook(() => useAssertionResult(SAMPLE, ctx));
    expect(result.current?.pass).toBe(false);
    expect(result.current?.failures.length).toBe(1);
    expect(result.current?.failures[0].raw).toContain("status === 200");
  });

  it("memoizes the result on stable inputs", () => {
    const ctx: AssertionContext = { status: 200, time_ms: 50 };
    const { result, rerender } = renderHook(
      ({ body, c }) => useAssertionResult(body, c),
      { initialProps: { body: SAMPLE, c: ctx } },
    );
    const first = result.current;
    rerender({ body: SAMPLE, c: ctx });
    expect(result.current).toBe(first);
  });

  it("recomputes when the context changes", () => {
    const passing: AssertionContext = { status: 200, time_ms: 50 };
    const failing: AssertionContext = { status: 500, time_ms: 50 };
    const { result, rerender } = renderHook(
      ({ c }) => useAssertionResult(SAMPLE, c),
      { initialProps: { c: passing } },
    );
    expect(result.current?.pass).toBe(true);
    rerender({ c: failing });
    expect(result.current?.pass).toBe(false);
  });
});
