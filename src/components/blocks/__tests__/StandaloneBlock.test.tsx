import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { StandaloneBlock } from "@/components/blocks/standalone/StandaloneBlock";
import { mockTauriCommand, clearTauriMocks } from "@/test/mocks/tauri";

describe("StandaloneBlock", () => {
  beforeEach(() => {
    clearTauriMocks();
  });

  afterEach(() => {
    clearTauriMocks();
  });

  describe("render", () => {
    it("shows the block badge from blockType (HTTP)", () => {
      renderWithProviders(
        <StandaloneBlock blockType="http" content='{"method":"GET","url":"/x"}' />,
      );
      expect(screen.getByText("HTTP")).toBeInTheDocument();
    });

    it("shows method + url badges for HTTP blocks with parsed JSON", () => {
      renderWithProviders(
        <StandaloneBlock
          blockType="http"
          content='{"method":"POST","url":"https://api.test/hello"}'
        />,
      );
      expect(screen.getByText("POST")).toBeInTheDocument();
      expect(screen.getByText("https://api.test/hello")).toBeInTheDocument();
    });

    it("renders alias when provided", () => {
      renderWithProviders(
        <StandaloneBlock blockType="db" content="select 1" alias="q1" />,
      );
      expect(screen.getByPlaceholderText("alias...")).toHaveValue("q1");
    });

    it("starts in input display mode (no output yet)", () => {
      renderWithProviders(
        <StandaloneBlock blockType="db" content="select 1" />,
      );
      // idle state shouldn't render the output content; placeholder is hidden in input mode
      // The action button labelled 'Run' should be visible
      expect(
        screen.getByRole("button", { name: "Run" }),
      ).toBeInTheDocument();
    });
  });

  describe("execution — DB block", () => {
    it("renders 'rows' badge after a successful SELECT", async () => {
      const user = userEvent.setup();
      mockTauriCommand("execute_block", () => ({
        status: "ok",
        data: {
          results: [
            {
              kind: "select",
              columns: [
                { name: "id", type: "int" },
                { name: "name", type: "text" },
              ],
              rows: [
                { id: 1, name: "alice" },
                { id: 2, name: "bob" },
              ],
              has_more: false,
            },
          ],
          messages: [],
          stats: { elapsed_ms: 10 },
        },
        duration_ms: 10,
      }));

      renderWithProviders(
        <StandaloneBlock
          blockType="db"
          content='{"query":"SELECT * FROM users","connectionId":"c1"}'
        />,
      );

      await user.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(() => {
        expect(screen.getByText("2 rows")).toBeInTheDocument();
      });
      expect(screen.getByText("success")).toBeInTheDocument();
    });

    it("renders 'rows affected' badge for mutation", async () => {
      const user = userEvent.setup();
      mockTauriCommand("execute_block", () => ({
        status: "ok",
        data: {
          results: [{ kind: "mutation", rows_affected: 5 }],
          messages: [],
          stats: { elapsed_ms: 10 },
        },
        duration_ms: 10,
      }));

      renderWithProviders(
        <StandaloneBlock
          blockType="db"
          content='{"query":"DELETE FROM x","connectionId":"c1"}'
        />,
      );

      await user.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(() =>
        expect(screen.getByText("5 rows affected")).toBeInTheDocument(),
      );
    });

    it("renders error message when DB result is an error kind", async () => {
      const user = userEvent.setup();
      mockTauriCommand("execute_block", () => ({
        status: "ok",
        data: {
          results: [{ kind: "error", message: "syntax error near 'SELCT'" }],
          messages: [],
          stats: { elapsed_ms: 1 },
        },
        duration_ms: 1,
      }));

      renderWithProviders(
        <StandaloneBlock
          blockType="db"
          content='{"query":"SELCT bad","connectionId":"c1"}'
        />,
      );

      await user.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(() =>
        expect(screen.getByText(/syntax error/i)).toBeInTheDocument(),
      );
    });
  });

  describe("execution — HTTP block (raw response)", () => {
    it("renders raw JSON response in output", async () => {
      const user = userEvent.setup();
      mockTauriCommand("execute_block", () => ({
        status: "ok",
        data: { hello: "world" },
        duration_ms: 5,
      }));

      renderWithProviders(
        <StandaloneBlock
          blockType="http"
          content='{"method":"GET","url":"/api/x"}'
        />,
      );

      await user.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(() => expect(screen.getByText(/hello/)).toBeInTheDocument());
    });
  });

  describe("error path", () => {
    it("captures thrown error message", async () => {
      const user = userEvent.setup();
      mockTauriCommand("execute_block", () => {
        throw new Error("backend offline");
      });

      renderWithProviders(
        <StandaloneBlock blockType="http" content='{"method":"GET","url":"/x"}' />,
      );

      await user.click(screen.getByRole("button", { name: "Run" }));

      await waitFor(() =>
        expect(screen.getByText("backend offline")).toBeInTheDocument(),
      );
      expect(screen.getByText("error")).toBeInTheDocument();
    });
  });

  describe("display mode toggling", () => {
    it("switches to output mode when clicking Output", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <StandaloneBlock blockType="http" content='{"method":"GET","url":"/x"}' />,
      );

      await user.click(screen.getByRole("button", { name: "Output" }));
      // In output mode with idle state, the placeholder appears
      expect(screen.getByText("Run to see results")).toBeInTheDocument();
    });
  });
});
