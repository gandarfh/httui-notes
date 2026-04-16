import { describe, it, expect } from "vitest";
import {
  parseReferences,
  navigateJson,
  resolveAllReferences,
  type BlockContext,
} from "../references";

describe("parseReferences", () => {
  it("extracts a single reference", () => {
    const refs = parseReferences("GET /posts/{{login.response.body.id}}");
    expect(refs).toHaveLength(1);
    expect(refs[0].alias).toBe("login");
    expect(refs[0].path).toEqual(["response", "body", "id"]);
    expect(refs[0].raw).toBe("{{login.response.body.id}}");
  });

  it("extracts multiple references", () => {
    const refs = parseReferences("{{a.response.x}} and {{b.response.y}}");
    expect(refs).toHaveLength(2);
    expect(refs[0].alias).toBe("a");
    expect(refs[1].alias).toBe("b");
  });

  it("returns empty for text without references", () => {
    expect(parseReferences("just plain text")).toHaveLength(0);
  });

  it("handles alias-only reference (no path)", () => {
    const refs = parseReferences("{{myblock}}");
    expect(refs).toHaveLength(1);
    expect(refs[0].alias).toBe("myblock");
    expect(refs[0].path).toEqual([]);
  });

  it("trims whitespace in reference", () => {
    const refs = parseReferences("{{ login.response.body.id }}");
    expect(refs[0].alias).toBe("login");
    expect(refs[0].path).toEqual(["response", "body", "id"]);
  });
});

describe("navigateJson", () => {
  const data = {
    status_code: 200,
    body: {
      id: 42,
      items: [
        { name: "first" },
        { name: "second" },
      ],
    },
  };

  it("navigates simple path", () => {
    expect(navigateJson(data, ["status_code"])).toBe(200);
  });

  it("navigates nested path", () => {
    expect(navigateJson(data, ["body", "id"])).toBe(42);
  });

  it("navigates into arrays by index", () => {
    expect(navigateJson(data, ["body", "items", "0", "name"])).toBe("first");
    expect(navigateJson(data, ["body", "items", "1", "name"])).toBe("second");
  });

  it("returns object if path ends at object", () => {
    expect(navigateJson(data, ["body"])).toEqual({ id: 42, items: [{ name: "first" }, { name: "second" }] });
  });

  it("returns root if path is empty", () => {
    expect(navigateJson(data, [])).toBe(data);
  });

  it("throws on missing key", () => {
    expect(() => navigateJson(data, ["nonexistent"])).toThrow('Key "nonexistent" not found');
  });

  it("throws on out of bounds array index", () => {
    expect(() => navigateJson(data, ["body", "items", "5"])).toThrow("out of bounds");
  });

  it("throws on accessing property of primitive", () => {
    expect(() => navigateJson(data, ["status_code", "foo"])).toThrow('Cannot access "foo" on number');
  });
});

describe("resolveAllReferences", () => {
  const blocks: BlockContext[] = [
    {
      alias: "login",
      blockType: "http",
      pos: 10,
      content: "{}",
      cachedResult: {
        status: "success",
        response: JSON.stringify({
          status_code: 201,
          body: { id: 101, token: "abc123" },
        }),
      },
    },
    {
      alias: "users",
      blockType: "http",
      pos: 50,
      content: "{}",
      cachedResult: {
        status: "success",
        response: JSON.stringify({
          status_code: 200,
          body: [{ id: 1, name: "Alice" }],
        }),
      },
    },
  ];

  it("resolves a single reference", () => {
    const { resolved, errors } = resolveAllReferences(
      "/posts/{{login.response.body.id}}",
      blocks,
      100,
    );
    expect(errors).toHaveLength(0);
    expect(resolved).toBe("/posts/101");
  });

  it("resolves multiple references", () => {
    const { resolved, errors } = resolveAllReferences(
      "{{login.response.body.token}} for user {{users.response.body.0.name}}",
      blocks,
      100,
    );
    expect(errors).toHaveLength(0);
    expect(resolved).toBe("abc123 for user Alice");
  });

  it("returns text unchanged when no references", () => {
    const { resolved, errors } = resolveAllReferences("plain text", blocks, 100);
    expect(resolved).toBe("plain text");
    expect(errors).toHaveLength(0);
  });

  it("returns error for unknown alias", () => {
    const { errors } = resolveAllReferences("{{unknown.response.x}}", blocks, 100);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("not found");
  });

  it("returns error for block below current position", () => {
    const { errors } = resolveAllReferences(
      "{{users.response.body}}",
      blocks,
      30, // users is at pos 50, current is at 30
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("below");
  });

  it("returns error for block without cache", () => {
    const blocksNoCache: BlockContext[] = [
      { alias: "nocache", blockType: "http", pos: 5, content: "{}", cachedResult: null },
    ];
    const { errors } = resolveAllReferences("{{nocache.response.x}}", blocksNoCache, 100);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("no cached result");
  });

  it("returns error for invalid JSON path", () => {
    const { errors } = resolveAllReferences("{{login.response.body.nonexistent}}", blocks, 100);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("not found");
  });

  it("serializes object values as JSON", () => {
    const { resolved } = resolveAllReferences("{{login.response.body}}", blocks, 100);
    expect(resolved).toBe(JSON.stringify({ id: 101, token: "abc123" }));
  });
});
