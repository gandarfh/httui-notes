import { describe, expect, it } from "vitest";

import {
  aggregateAssertionResults,
  firstAssertionFailureBlock,
  type BlockAssertionRun,
} from "@/lib/blocks/assertions-aggregate";

function run(
  alias: string,
  total: number,
  failures: number,
  noResult = false,
): BlockAssertionRun {
  return {
    blockAlias: alias,
    total,
    result: noResult
      ? null
      : {
          pass: failures === 0,
          failures: Array.from({ length: failures }, (_, i) => ({
            line: i + 1,
            raw: `assertion-${i}`,
            actual: 1,
            expected: 2,
            reason: "values not equal",
          })),
        },
  };
}

describe("aggregateAssertionResults", () => {
  it("returns a zero summary when runs is empty", () => {
    expect(aggregateAssertionResults([])).toEqual({
      blocks: 0,
      assertions: 0,
      passed: 0,
      failed: 0,
      failedBlocks: [],
      allPass: true,
    });
  });

  it("counts blocks even when none have assertions", () => {
    const out = aggregateAssertionResults([
      run("a", 0, 0, true),
      run("b", 0, 0, true),
    ]);
    expect(out.blocks).toBe(2);
    expect(out.assertions).toBe(0);
    expect(out.allPass).toBe(true);
  });

  it("rolls up totals across multiple blocks (all-pass case)", () => {
    const out = aggregateAssertionResults([run("a", 3, 0), run("b", 4, 0)]);
    expect(out).toEqual({
      blocks: 2,
      assertions: 7,
      passed: 7,
      failed: 0,
      failedBlocks: [],
      allPass: true,
    });
  });

  it("collects failedBlocks in input order; passed = total - failures", () => {
    const out = aggregateAssertionResults([
      run("a", 3, 0),
      run("b", 4, 1),
      run("c", 2, 2),
    ]);
    expect(out.passed).toBe(3 + 3 + 0);
    expect(out.failed).toBe(0 + 1 + 2);
    expect(out.failedBlocks).toEqual(["b", "c"]);
    expect(out.allPass).toBe(false);
  });

  it("treats null result as 'unrun': counts in total but not in passed/failed", () => {
    const out = aggregateAssertionResults([
      run("a", 3, 0, true),
      run("b", 2, 1),
    ]);
    expect(out.assertions).toBe(5);
    expect(out.passed).toBe(1);
    expect(out.failed).toBe(1);
  });

  it("allPass is true when total is zero across the runs (no assertions to fail)", () => {
    const out = aggregateAssertionResults([run("a", 0, 0, true)]);
    expect(out.allPass).toBe(true);
  });
});

describe("firstAssertionFailureBlock", () => {
  it("returns null when nothing has failed", () => {
    expect(
      firstAssertionFailureBlock([run("a", 1, 0), run("b", 1, 0)]),
    ).toBeNull();
  });

  it("returns the first failing alias in input order", () => {
    expect(
      firstAssertionFailureBlock([
        run("a", 1, 0),
        run("b", 2, 1),
        run("c", 3, 2),
      ]),
    ).toBe("b");
  });

  it("ignores blocks with null result (unrun)", () => {
    expect(
      firstAssertionFailureBlock([
        run("a", 1, 0, true),
        run("b", 1, 0, true),
        run("c", 1, 1),
      ]),
    ).toBe("c");
  });
});
