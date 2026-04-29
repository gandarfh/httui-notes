import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { HttpStatusBar } from "@/components/blocks/http/fenced/HttpStatusBar";
import type { ExecutionState } from "@/components/blocks/http/fenced/shared";
import type { HttpResponseFull } from "@/lib/tauri/streamedExecution";

const mkResponse = (
  over: Partial<HttpResponseFull> = {},
): HttpResponseFull => ({
  status_code: 200,
  status_text: "OK",
  headers: { "content-type": "application/json" },
  body: {},
  size_bytes: 1234,
  elapsed_ms: 42,
  timing: { total_ms: 42, connection_reused: false },
  cookies: [],
  ...over,
});

const baseProps = {
  alias: undefined as string | undefined,
  host: null as string | null,
  executionState: "idle" as ExecutionState,
  response: null as HttpResponseFull | null,
  durationMs: null as number | null,
  cached: false,
  lastRunAt: null as Date | null,
  downloadingBytes: 0,
  onSendAs: vi.fn(),
};

describe("HttpStatusBar", () => {
  describe("state label", () => {
    it("idle", () => {
      renderWithProviders(<HttpStatusBar {...baseProps} />);
      expect(screen.getByText("idle")).toBeInTheDocument();
    });

    it("running", () => {
      renderWithProviders(
        <HttpStatusBar {...baseProps} executionState="running" />,
      );
      expect(screen.getByText("running")).toBeInTheDocument();
    });

    it("cancelled", () => {
      renderWithProviders(
        <HttpStatusBar {...baseProps} executionState="cancelled" />,
      );
      expect(screen.getByText("cancelled")).toBeInTheDocument();
    });

    it("error", () => {
      renderWithProviders(
        <HttpStatusBar {...baseProps} executionState="error" />,
      );
      expect(screen.getByText("error")).toBeInTheDocument();
    });

    it("success → status code", () => {
      renderWithProviders(
        <HttpStatusBar
          {...baseProps}
          executionState="success"
          response={mkResponse({ status_code: 201 })}
        />,
      );
      expect(screen.getByText("201")).toBeInTheDocument();
    });
  });

  describe("conditional segments", () => {
    it("shows host when provided", () => {
      renderWithProviders(
        <HttpStatusBar {...baseProps} host="api.example.com" />,
      );
      expect(screen.getByText(/api\.example\.com/)).toBeInTheDocument();
    });

    it("shows downloading bytes only while running and bytes > 0", () => {
      const { rerender } = renderWithProviders(
        <HttpStatusBar
          {...baseProps}
          executionState="running"
          downloadingBytes={2048}
        />,
      );
      expect(screen.getByText(/downloading 2\.0 KB/)).toBeInTheDocument();

      rerender(
        <HttpStatusBar
          {...baseProps}
          executionState="running"
          downloadingBytes={0}
        />,
      );
      expect(screen.queryByText(/downloading/)).not.toBeInTheDocument();
    });

    it("shows durationMs only when not running", () => {
      const { rerender } = renderWithProviders(
        <HttpStatusBar
          {...baseProps}
          executionState="success"
          durationMs={150}
          response={mkResponse()}
        />,
      );
      expect(screen.getByText(/150ms/)).toBeInTheDocument();

      rerender(
        <HttpStatusBar
          {...baseProps}
          executionState="running"
          durationMs={150}
        />,
      );
      expect(screen.queryByText(/150ms/)).not.toBeInTheDocument();
    });

    it("shows response size only when response exists and not running", () => {
      renderWithProviders(
        <HttpStatusBar
          {...baseProps}
          executionState="success"
          response={mkResponse({ size_bytes: 5_300_000 })}
        />,
      );
      expect(screen.getByText(/5\.05 MB/)).toBeInTheDocument();
    });

    it("shows 'ran X ago' when lastRunAt is set and not running", () => {
      const ago = new Date(Date.now() - 30_000); // 30s ago
      renderWithProviders(
        <HttpStatusBar
          {...baseProps}
          executionState="success"
          response={mkResponse()}
          lastRunAt={ago}
        />,
      );
      expect(screen.getByText(/ran .*30s ago/)).toBeInTheDocument();
    });

    it("shows 'cached' marker when cached=true", () => {
      renderWithProviders(<HttpStatusBar {...baseProps} cached={true} />);
      expect(screen.getByText(/· cached/)).toBeInTheDocument();
    });

    it("shows alias text when provided", () => {
      renderWithProviders(<HttpStatusBar {...baseProps} alias="ping" />);
      expect(screen.getByText(/· ping/)).toBeInTheDocument();
    });
  });

  describe("send-as menu", () => {
    it("opens menu and calls onSendAs('curl') when 'Copy as cURL' selected", async () => {
      const user = userEvent.setup();
      const onSendAs = vi.fn();
      renderWithProviders(<HttpStatusBar {...baseProps} onSendAs={onSendAs} />);

      await user.click(
        screen.getByRole("button", { name: /send as.*copy snippet/i }),
      );

      // Menu items render in a Portal
      const curl = await screen.findByText(/copy as cURL/i);
      await user.click(curl);

      expect(onSendAs).toHaveBeenCalledWith("curl");
    });

    it("calls onSendAs('python') for the Python option", async () => {
      const user = userEvent.setup();
      const onSendAs = vi.fn();
      renderWithProviders(<HttpStatusBar {...baseProps} onSendAs={onSendAs} />);

      await user.click(
        screen.getByRole("button", { name: /send as.*copy snippet/i }),
      );
      const opt = await screen.findByText(/copy as python/i);
      await user.click(opt);

      expect(onSendAs).toHaveBeenCalledWith("python");
    });

    it("calls onSendAs('http-file') for the .http file option", async () => {
      const user = userEvent.setup();
      const onSendAs = vi.fn();
      renderWithProviders(<HttpStatusBar {...baseProps} onSendAs={onSendAs} />);

      await user.click(
        screen.getByRole("button", { name: /send as.*copy snippet/i }),
      );
      const opt = await screen.findByText(/save as \.http file/i);
      await user.click(opt);

      expect(onSendAs).toHaveBeenCalledWith("http-file");
    });
  });
});
