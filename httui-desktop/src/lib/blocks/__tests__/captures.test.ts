import { describe, expect, it } from "vitest";

import {
  captureValuesFromBody,
  evaluateCaptures,
  extractCaptureLines,
  isSecretCaptureKey,
  parseAllCaptures,
  parseCaptureLine,
  type CaptureContext,
} from "@/lib/blocks/captures";

describe("extractCaptureLines", () => {
  it("returns empty when no marker is present", () => {
    expect(extractCaptureLines("POST /\n")).toEqual([]);
  });

  it("collects every commented line until a blank line", () => {
    const body = `POST /

# capture:
# token = $.body.access_token
# user_id = $.body.user.id

# trailing comment after blank — ignored`;
    expect(extractCaptureLines(body).map((l) => l.rawLine)).toEqual([
      "token = $.body.access_token",
      "user_id = $.body.user.id",
    ]);
  });

  it("matches the marker case-insensitively", () => {
    expect(
      extractCaptureLines("# CAPTURE:\n# k = $.body.x").map((l) => l.rawLine),
    ).toEqual(["k = $.body.x"]);
  });

  it("stops at the first non-comment line before blank", () => {
    const body = `# capture:
# a = $.body.x
not-a-comment
# b = $.body.y`;
    expect(extractCaptureLines(body).map((l) => l.rawLine)).toEqual([
      "a = $.body.x",
    ]);
  });

  it("attaches the 1-indexed body line number", () => {
    const body = `line1
# capture:
# token = $.body.t`;
    expect(extractCaptureLines(body)[0].bodyLine).toBe(3);
  });
});

describe("parseCaptureLine", () => {
  it("parses `<key> = <expr>`", () => {
    expect(parseCaptureLine("token = $.body.access_token", 7)).toEqual({
      line: 7,
      raw: "token = $.body.access_token",
      key: "token",
      expr: "$.body.access_token",
    });
  });

  it("returns null when no `=` is present", () => {
    expect(parseCaptureLine("token $.body.x", 1)).toBeNull();
  });

  it("returns null when key or expr is empty", () => {
    expect(parseCaptureLine("= $.body.x", 1)).toBeNull();
    expect(parseCaptureLine("token =", 1)).toBeNull();
  });

  it("returns null when key contains whitespace or dot", () => {
    expect(parseCaptureLine("my key = $.body.x", 1)).toBeNull();
    expect(parseCaptureLine("a.b = $.body.x", 1)).toBeNull();
  });

  it("accepts hyphens, underscores, and leading dollar/underscore", () => {
    expect(parseCaptureLine("user_id = $.body.user.id", 1)?.key).toBe(
      "user_id",
    );
    expect(parseCaptureLine("first-name = $.body.first", 1)?.key).toBe(
      "first-name",
    );
    expect(parseCaptureLine("$tmp = $.body.x", 1)?.key).toBe("$tmp");
    expect(parseCaptureLine("_internal = $.body.x", 1)?.key).toBe("_internal");
  });
});

describe("parseAllCaptures", () => {
  it("composes extract + parse and drops unparseable lines silently", () => {
    const body = `# capture:
# token = $.body.access_token
# this-line-is-malformed
# user_id = $.body.user.id`;
    const out = parseAllCaptures(body);
    expect(out.map((c) => c.key)).toEqual(["token", "user_id"]);
  });
});

describe("evaluateCaptures + captureValuesFromBody", () => {
  const ctx: CaptureContext = {
    status: 200,
    time_ms: 17,
    body: { access_token: "abc.def.ghi", user: { id: 99 } },
    headers: { "X-Trace": "trace-1" },
    row: [{ id: 1 }],
  };

  it("evaluates each capture against the context", () => {
    const out = evaluateCaptures(
      [
        {
          line: 1,
          raw: "token = $.body.access_token",
          key: "token",
          expr: "$.body.access_token",
        },
        {
          line: 2,
          raw: "user = $.body.user.id",
          key: "user",
          expr: "$.body.user.id",
        },
      ],
      ctx,
    );
    expect(out).toEqual({ token: "abc.def.ghi", user: 99 });
  });

  it("returns undefined when the path doesn't resolve", () => {
    const out = evaluateCaptures(
      [
        {
          line: 1,
          raw: "missing = $.body.nope",
          key: "missing",
          expr: "$.body.nope",
        },
      ],
      ctx,
    );
    expect(out.missing).toBeUndefined();
  });

  it("supports status / time / $.headers / $.row", () => {
    const out = captureValuesFromBody(
      `# capture:
# st = status
# t = time
# trace = $.headers.X-Trace
# row_id = $.row[0].id`,
      ctx,
    );
    expect(out).toEqual({
      st: 200,
      t: 17,
      trace: "trace-1",
      row_id: 1,
    });
  });

  it("captureValuesFromBody returns {} when no marker is present", () => {
    expect(captureValuesFromBody("POST /\n", ctx)).toEqual({});
  });
});

describe("isSecretCaptureKey", () => {
  it("flags password / token / secret / key / auth*", () => {
    expect(isSecretCaptureKey("password")).toBe(true);
    expect(isSecretCaptureKey("access_token")).toBe(true);
    expect(isSecretCaptureKey("user_secret")).toBe(true);
    expect(isSecretCaptureKey("api_key")).toBe(true);
    expect(isSecretCaptureKey("authorization")).toBe(true);
  });

  it("doesn't flag innocuous keys", () => {
    expect(isSecretCaptureKey("user_id")).toBe(false);
    expect(isSecretCaptureKey("count")).toBe(false);
    expect(isSecretCaptureKey("name")).toBe(false);
  });

  it("matches case-insensitively", () => {
    expect(isSecretCaptureKey("Password")).toBe(true);
    expect(isSecretCaptureKey("AUTH_BEARER")).toBe(true);
  });
});
