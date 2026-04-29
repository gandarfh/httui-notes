import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { HttpResultTabs } from "@/components/blocks/http/fenced/HttpResultTabs";
import type { ExecutionState } from "@/components/blocks/http/fenced/shared";
import type {
  HttpCookieRaw,
  HttpResponseFull,
  HttpTimingBreakdown,
} from "@/lib/tauri/streamedExecution";

const mkTiming = (
  over: Partial<HttpTimingBreakdown> = {},
): HttpTimingBreakdown => ({
  total_ms: 100,
  connection_reused: false,
  ...over,
});

const mkCookie = (
  name: string,
  value: string,
  over: Partial<HttpCookieRaw> = {},
): HttpCookieRaw => ({
  name,
  value,
  domain: null,
  path: null,
  expires: null,
  secure: false,
  http_only: false,
  ...over,
});

const mkResponse = (
  over: Partial<HttpResponseFull> = {},
): HttpResponseFull => ({
  status_code: 200,
  status_text: "OK",
  headers: { "content-type": "application/json", "x-trace": "abc" },
  body: { hello: "world" },
  size_bytes: 50,
  elapsed_ms: 10,
  timing: mkTiming(),
  cookies: [],
  ...over,
});

const baseProps = {
  executionState: "success" as ExecutionState,
  response: mkResponse(),
  error: null as string | null,
  cached: false,
  bodyView: () => <div data-testid="body-view">BODY</div>,
};

describe("HttpResultTabs — early returns", () => {
  it("running → spinner + 'Running request...'", () => {
    renderWithProviders(
      <HttpResultTabs {...baseProps} executionState="running" />,
    );
    expect(screen.getByText(/Running request/)).toBeInTheDocument();
    expect(screen.queryByText(/Headers \(/)).not.toBeInTheDocument();
  });

  it("error with message → 'Request failed' + the error text", () => {
    renderWithProviders(
      <HttpResultTabs
        {...baseProps}
        executionState="error"
        error="connection refused"
      />,
    );
    expect(screen.getByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("connection refused")).toBeInTheDocument();
  });

  it("error without message → no early return (falls through to idle hint)", () => {
    renderWithProviders(
      <HttpResultTabs
        {...baseProps}
        executionState="error"
        error={null}
        response={null}
      />,
    );
    // Falls through past the error branch (no error message), then idle/no
    // response branch kicks in.
    expect(screen.getByText(/No response yet/)).toBeInTheDocument();
  });

  it("cancelled → 'Cancelled'", () => {
    renderWithProviders(
      <HttpResultTabs {...baseProps} executionState="cancelled" />,
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("idle → 'No response yet'", () => {
    renderWithProviders(
      <HttpResultTabs {...baseProps} executionState="idle" response={null} />,
    );
    expect(screen.getByText(/No response yet/)).toBeInTheDocument();
  });
});

describe("HttpResultTabs — tabs", () => {
  it("renders all five tab triggers with counts", () => {
    renderWithProviders(<HttpResultTabs {...baseProps} />);
    expect(screen.getByRole("tab", { name: /^body$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Headers (2)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Cookies (0)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /timing/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^raw$/i })).toBeInTheDocument();
  });

  it("renders the 'Response' label and conditionally 'cached' badge", () => {
    const { rerender } = renderWithProviders(
      <HttpResultTabs {...baseProps} cached={false} />,
    );
    expect(screen.getByText("Response")).toBeInTheDocument();
    expect(screen.queryByText(/^cached$/i)).not.toBeInTheDocument();

    rerender(<HttpResultTabs {...baseProps} cached={true} />);
    expect(screen.getByText(/^cached$/i)).toBeInTheDocument();
  });

  it("Body tab renders bodyView output", () => {
    const bodyView = vi.fn(
      (raw: string, pretty: string, _resp: HttpResponseFull) => (
        <div data-testid="bv">
          raw={raw}|pretty-len={pretty.length}
        </div>
      ),
    );

    renderWithProviders(<HttpResultTabs {...baseProps} bodyView={bodyView} />);

    // Default tab is Body — bodyView should have been invoked
    expect(bodyView).toHaveBeenCalled();
    expect(screen.getByTestId("bv")).toBeInTheDocument();
  });

  it("Headers tab shows entries", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HttpResultTabs {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: "Headers (2)" }));

    expect(screen.getByText("content-type")).toBeInTheDocument();
    expect(screen.getByText("application/json")).toBeInTheDocument();
    expect(screen.getByText("x-trace")).toBeInTheDocument();
  });

  it("Headers tab empty state", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpResultTabs {...baseProps} response={mkResponse({ headers: {} })} />,
    );

    await user.click(screen.getByRole("tab", { name: "Headers (0)" }));
    expect(screen.getByText("(no headers)")).toBeInTheDocument();
  });

  it("Cookies tab shows '(no Set-Cookie...)' when empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HttpResultTabs {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: "Cookies (0)" }));
    expect(screen.getByText(/no Set-Cookie headers/i)).toBeInTheDocument();
  });

  it("Cookies tab renders cookie rows when present", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpResultTabs
        {...baseProps}
        response={mkResponse({
          cookies: [
            mkCookie("session", "abc123", {
              domain: ".test",
              path: "/",
              secure: true,
              http_only: true,
            }),
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Cookies (1)" }));
    expect(screen.getByText("session")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText(".test")).toBeInTheDocument();
    expect(screen.getByText(/Secure · HttpOnly/)).toBeInTheDocument();
  });

  it("Timing tab shows total only when no breakdown is present", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HttpResultTabs {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /timing/i }));
    expect(screen.getByText(/breakdown will appear/i)).toBeInTheDocument();
  });

  it("Timing tab shows breakdown rows when fields present", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpResultTabs
        {...baseProps}
        response={mkResponse({
          timing: mkTiming({
            total_ms: 100,
            dns_ms: 10,
            connect_ms: 20,
            tls_ms: 30,
            ttfb_ms: 40,
          }),
        })}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /timing/i }));
    expect(screen.getByText("DNS")).toBeInTheDocument();
    expect(screen.getByText("Connect")).toBeInTheDocument();
    expect(screen.getByText("TLS")).toBeInTheDocument();
    expect(screen.getByText("TTFB")).toBeInTheDocument();
  });

  it("Raw tab shows status line + headers + pretty body", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HttpResultTabs {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /^raw$/i }));
    // Match the full raw text via a flexible regex
    expect(
      screen.getByText(/200 OK[\s\S]+content-type:[\s\S]+"hello": "world"/),
    ).toBeInTheDocument();
  });
});
