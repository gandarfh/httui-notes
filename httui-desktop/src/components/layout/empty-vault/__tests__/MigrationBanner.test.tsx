import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";

import { MigrationBanner } from "@/components/layout/empty-vault/MigrationBanner";

describe("MigrationBanner", () => {
  it("renders the headline + 'Run migration' CTA + docs link", () => {
    renderWithProviders(
      <MigrationBanner onMigrate={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByText(/MVP vault detected/)).toBeInTheDocument();
    expect(screen.getByTestId("migration-banner-run")).toBeInTheDocument();
    expect(
      screen.getByTestId("migration-banner-docs").getAttribute("href"),
    ).toContain("MIGRATION.md");
  });

  it("'Run migration' click dispatches onMigrate", async () => {
    const onMigrate = vi.fn();
    renderWithProviders(
      <MigrationBanner onMigrate={onMigrate} onDismiss={() => {}} />,
    );
    await userEvent.setup().click(screen.getByTestId("migration-banner-run"));
    expect(onMigrate).toHaveBeenCalledTimes(1);
  });

  it("dismiss button dispatches onDismiss", async () => {
    const onDismiss = vi.fn();
    renderWithProviders(
      <MigrationBanner onMigrate={() => {}} onDismiss={onDismiss} />,
    );
    await userEvent
      .setup()
      .click(screen.getByLabelText("Dismiss migration banner"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("supports a custom docs href", () => {
    renderWithProviders(
      <MigrationBanner
        onMigrate={() => {}}
        onDismiss={() => {}}
        docsHref="https://example.com/m"
      />,
    );
    expect(
      screen.getByTestId("migration-banner-docs").getAttribute("href"),
    ).toBe("https://example.com/m");
  });

  it("role='alert' so screen readers announce on mount", () => {
    renderWithProviders(
      <MigrationBanner onMigrate={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
