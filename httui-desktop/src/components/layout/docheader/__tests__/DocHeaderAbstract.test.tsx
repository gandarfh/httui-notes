import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";

import { DocHeaderAbstract } from "@/components/layout/docheader/DocHeaderAbstract";
import { ABSTRACT_FADE_THRESHOLD } from "@/components/layout/docheader/docheader-derive";
import { renderWithProviders, screen } from "@/test/render";

describe("DocHeaderAbstract", () => {
  it("renders nothing when frontmatter is null", () => {
    renderWithProviders(<DocHeaderAbstract frontmatter={null} />);
    expect(
      screen.queryByTestId("docheader-abstract"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when frontmatter has no abstract", () => {
    renderWithProviders(<DocHeaderAbstract frontmatter={{}} />);
    expect(
      screen.queryByTestId("docheader-abstract"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when abstract is whitespace-only", () => {
    renderWithProviders(
      <DocHeaderAbstract frontmatter={{ abstract: "   " }} />,
    );
    expect(
      screen.queryByTestId("docheader-abstract"),
    ).not.toBeInTheDocument();
  });

  it("renders a short abstract without truncation hints", () => {
    renderWithProviders(
      <DocHeaderAbstract frontmatter={{ abstract: "Short summary." }} />,
    );
    expect(screen.getByTestId("docheader-abstract-text").textContent).toBe(
      "Short summary.",
    );
    expect(
      screen.queryByTestId("docheader-abstract-toggle"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("docheader-abstract-fade"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId("docheader-abstract")
        .getAttribute("data-clamped"),
    ).toBeNull();
  });

  it("renders the toggle + fade for long abstracts (>250 chars)", () => {
    const long = "x".repeat(ABSTRACT_FADE_THRESHOLD + 1);
    renderWithProviders(
      <DocHeaderAbstract frontmatter={{ abstract: long }} />,
    );
    expect(screen.getByTestId("docheader-abstract-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("docheader-abstract-fade")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("docheader-abstract")
        .getAttribute("data-clamped"),
    ).toBe("true");
  });

  it("toggle reads 'more' when collapsed and 'less' when expanded", async () => {
    const long = "x".repeat(ABSTRACT_FADE_THRESHOLD + 1);
    renderWithProviders(
      <DocHeaderAbstract frontmatter={{ abstract: long }} />,
    );
    const toggle = screen.getByTestId("docheader-abstract-toggle");
    expect(toggle.textContent).toBe("more");
    await userEvent.setup().click(toggle);
    expect(toggle.textContent).toBe("less");
  });

  it("removes the fade and clamp flag when expanded", async () => {
    const long = "x".repeat(ABSTRACT_FADE_THRESHOLD + 1);
    renderWithProviders(
      <DocHeaderAbstract frontmatter={{ abstract: long }} />,
    );
    await userEvent
      .setup()
      .click(screen.getByTestId("docheader-abstract-toggle"));
    expect(
      screen.queryByTestId("docheader-abstract-fade"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId("docheader-abstract")
        .getAttribute("data-clamped"),
    ).toBeNull();
  });

  it("trims surrounding whitespace before rendering", () => {
    renderWithProviders(
      <DocHeaderAbstract frontmatter={{ abstract: "  Hello  " }} />,
    );
    expect(screen.getByTestId("docheader-abstract-text").textContent).toBe(
      "Hello",
    );
  });
});
