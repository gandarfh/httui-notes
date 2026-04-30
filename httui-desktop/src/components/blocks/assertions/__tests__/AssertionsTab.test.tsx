import { describe, expect, it } from "vitest";

import { AssertionsTab } from "@/components/blocks/assertions/AssertionsTab";
import type { AssertionResult, ParsedAssertion } from "@/lib/blocks/assertions";
import { renderWithProviders, screen } from "@/test/render";

function pa(line: number, raw: string): ParsedAssertion {
  return {
    line,
    raw,
    lhs: raw.split(/[<>=!]/)[0].trim(),
    op: "===" as const,
    rhs:
      raw
        .split(/[<>=!]/)
        .pop()
        ?.trim() ?? "",
  };
}

describe("AssertionsTab", () => {
  it("renders the empty hint when no assertions are defined", () => {
    renderWithProviders(<AssertionsTab assertions={[]} result={null} />);
    expect(screen.getByTestId("assertions-tab-empty")).toBeInTheDocument();
  });

  it("renders the pending hint when assertions exist but no run yet", () => {
    renderWithProviders(
      <AssertionsTab
        assertions={[pa(1, "status === 200"), pa(2, "time < 1000")]}
        result={null}
      />,
    );
    expect(screen.getByTestId("assertions-tab-pending").textContent).toMatch(
      /Run the block.*2 assertions/,
    );
  });

  it("uses singular wording when only one assertion is pending", () => {
    renderWithProviders(
      <AssertionsTab assertions={[pa(1, "status === 200")]} result={null} />,
    );
    expect(screen.getByTestId("assertions-tab-pending").textContent).toMatch(
      /1 assertion\b/,
    );
  });

  it("renders one row per assertion when result is present", () => {
    const result: AssertionResult = { pass: true, failures: [] };
    renderWithProviders(
      <AssertionsTab
        assertions={[pa(1, "status === 200"), pa(2, "time < 1000")]}
        result={result}
      />,
    );
    expect(screen.getByTestId("assertions-tab-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("assertions-tab-row-2")).toBeInTheDocument();
  });

  it("marks rows as passed when no failure matches their line", () => {
    const result: AssertionResult = { pass: true, failures: [] };
    renderWithProviders(
      <AssertionsTab assertions={[pa(1, "status === 200")]} result={result} />,
    );
    expect(
      screen.getByTestId("assertions-tab-row-1").getAttribute("data-passed"),
    ).toBe("true");
    expect(screen.getByTestId("assertions-tab-row-1-icon").textContent).toBe(
      "✓",
    );
  });

  it("marks rows as failed and renders actual + expected + reason", () => {
    const result: AssertionResult = {
      pass: false,
      failures: [
        {
          line: 1,
          raw: "status === 200",
          actual: 404,
          expected: 200,
          reason: "values not equal",
        },
      ],
    };
    renderWithProviders(
      <AssertionsTab assertions={[pa(1, "status === 200")]} result={result} />,
    );
    expect(
      screen.getByTestId("assertions-tab-row-1").getAttribute("data-passed"),
    ).toBeNull();
    expect(screen.getByTestId("assertions-tab-row-1-icon").textContent).toBe(
      "✗",
    );
    const failure = screen.getByTestId(
      "assertions-tab-row-1-failure",
    ).textContent;
    expect(failure).toMatch(/actual 404/);
    expect(failure).toMatch(/expected 200/);
    expect(failure).toMatch(/values not equal/);
  });

  it("formats string actuals with quotes", () => {
    const result: AssertionResult = {
      pass: false,
      failures: [
        {
          line: 1,
          raw: "$.body.name === 'alice'",
          actual: "bob",
          expected: "alice",
          reason: "values not equal",
        },
      ],
    };
    renderWithProviders(
      <AssertionsTab
        assertions={[pa(1, "$.body.name === 'alice'")]}
        result={result}
      />,
    );
    expect(
      screen.getByTestId("assertions-tab-row-1-failure").textContent,
    ).toMatch(/actual "bob".*expected "alice"/);
  });

  it("renders undefined actual cleanly (no '[object Undefined]')", () => {
    const result: AssertionResult = {
      pass: false,
      failures: [
        {
          line: 1,
          raw: "$.body.missing === 1",
          actual: undefined,
          expected: 1,
          reason: "values not equal",
        },
      ],
    };
    renderWithProviders(
      <AssertionsTab
        assertions={[pa(1, "$.body.missing === 1")]}
        result={result}
      />,
    );
    expect(
      screen.getByTestId("assertions-tab-row-1-failure").textContent,
    ).toMatch(/actual undefined/);
  });

  it("data-pass on the wrapper reflects the aggregate result", () => {
    renderWithProviders(
      <AssertionsTab
        assertions={[pa(1, "status === 200")]}
        result={{ pass: true, failures: [] }}
      />,
    );
    expect(screen.getByTestId("assertions-tab").getAttribute("data-pass")).toBe(
      "true",
    );
  });
});
