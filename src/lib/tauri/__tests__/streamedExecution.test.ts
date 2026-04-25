import { describe, it, expect } from "vitest";
import { normalizeHttpResponse } from "../streamedExecution";

describe("normalizeHttpResponse", () => {
  it("accepts the new full shape verbatim", () => {
    const raw = {
      status_code: 200,
      status_text: "OK",
      headers: { "content-type": "application/json" },
      body: { hello: "world" },
      size_bytes: 17,
      elapsed_ms: 42,
      timing: { total_ms: 42, dns_ms: 5 },
      cookies: [
        {
          name: "sid",
          value: "abc",
          secure: true,
          http_only: false,
        },
      ],
    };
    const out = normalizeHttpResponse(raw);
    expect(out.status_code).toBe(200);
    expect(out.body).toEqual({ hello: "world" });
    expect(out.timing.total_ms).toBe(42);
    expect(out.timing.dns_ms).toBe(5);
    expect(out.cookies).toHaveLength(1);
    expect(out.cookies[0].name).toBe("sid");
  });

  it("synthesizes timing from elapsed_ms when missing", () => {
    const raw = {
      status_code: 200,
      status_text: "OK",
      headers: {},
      body: "",
      size_bytes: 0,
      elapsed_ms: 123,
    };
    const out = normalizeHttpResponse(raw);
    expect(out.timing).toEqual({ total_ms: 123 });
    expect(out.cookies).toEqual([]);
  });

  it("falls back to duration_ms (legacy cached shape)", () => {
    const raw = {
      status_code: 404,
      status_text: "Not Found",
      headers: {},
      body: "Not Found",
      size_bytes: 9,
      duration_ms: 18,
    };
    const out = normalizeHttpResponse(raw);
    expect(out.elapsed_ms).toBe(18);
    expect(out.timing.total_ms).toBe(18);
  });

  it("returns sane defaults for completely empty input", () => {
    const out = normalizeHttpResponse({});
    expect(out.status_code).toBe(0);
    expect(out.status_text).toBe("");
    expect(out.headers).toEqual({});
    expect(out.body).toBeUndefined();
    expect(out.size_bytes).toBe(0);
    expect(out.elapsed_ms).toBe(0);
    expect(out.timing).toEqual({ total_ms: 0 });
    expect(out.cookies).toEqual([]);
  });

  it("ignores invalid types instead of throwing", () => {
    const out = normalizeHttpResponse({
      status_code: "200",
      headers: "not an object",
      cookies: "nope",
      timing: 42,
    });
    expect(out.status_code).toBe(0);
    expect(out.headers).toEqual({});
    expect(out.cookies).toEqual([]);
    expect(out.timing).toEqual({ total_ms: 0 });
  });

  it("handles non-object roots", () => {
    expect(normalizeHttpResponse(null).status_code).toBe(0);
    expect(normalizeHttpResponse(undefined).status_code).toBe(0);
    expect(normalizeHttpResponse("string").status_code).toBe(0);
  });
});
