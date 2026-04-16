import { describe, it, expect } from "vitest";
import {
  extractReferencedAliases,
  topologicalSort,
} from "../dependencies";
import type { BlockContext } from "../references";

describe("extractReferencedAliases", () => {
  it("extracts aliases from URL", () => {
    const content = JSON.stringify({
      method: "GET",
      url: "https://api.com/posts/{{login.response.body.id}}",
      headers: [],
      body: "",
    });
    expect(extractReferencedAliases(content)).toEqual(["login"]);
  });

  it("extracts aliases from headers", () => {
    const content = JSON.stringify({
      method: "GET",
      url: "https://api.com",
      headers: [{ key: "Authorization", value: "Bearer {{auth.response.body.token}}" }],
      body: "",
    });
    expect(extractReferencedAliases(content)).toEqual(["auth"]);
  });

  it("extracts aliases from body", () => {
    const content = JSON.stringify({
      method: "POST",
      url: "https://api.com",
      headers: [],
      body: '{"userId": "{{user.response.body.id}}"}',
    });
    expect(extractReferencedAliases(content)).toEqual(["user"]);
  });

  it("extracts multiple unique aliases", () => {
    const content = JSON.stringify({
      method: "GET",
      url: "https://api.com/{{a.response.body.x}}/{{b.response.body.y}}",
      headers: [{ key: "X", value: "{{a.response.body.z}}" }],
      body: "",
    });
    const aliases = extractReferencedAliases(content);
    expect(aliases).toEqual(["a", "b"]);
  });

  it("returns empty for no references", () => {
    const content = JSON.stringify({
      method: "GET",
      url: "https://api.com",
      headers: [],
      body: "",
    });
    expect(extractReferencedAliases(content)).toEqual([]);
  });
});

describe("topologicalSort", () => {
  const makeBlock = (alias: string, refs: string[], pos: number): BlockContext => ({
    alias,
    blockType: "http",
    pos,
    content: JSON.stringify({
      method: "GET",
      url: refs.map((r) => `{{${r}.response.body.id}}`).join("/"),
      headers: [],
      body: "",
    }),
    cachedResult: null,
  });

  it("returns single dependency", () => {
    const blocks = [
      makeBlock("auth", [], 10),
      makeBlock("posts", ["auth"], 50),
    ];
    const order = topologicalSort(["auth"], blocks);
    expect(order).toEqual(["auth"]);
  });

  it("returns chain in correct order", () => {
    const blocks = [
      makeBlock("a", [], 10),
      makeBlock("b", ["a"], 20),
      makeBlock("c", ["b"], 30),
    ];
    const order = topologicalSort(["c"], blocks);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("handles diamond dependency", () => {
    const blocks = [
      makeBlock("a", [], 10),
      makeBlock("b", ["a"], 20),
      makeBlock("c", ["a"], 30),
      makeBlock("d", ["b", "c"], 40),
    ];
    const order = topologicalSort(["d"], blocks);
    expect(order[0]).toBe("a"); // a must be first
    expect(order[order.length - 1]).toBe("d"); // d must be last
    expect(order).toHaveLength(4);
  });

  it("detects cycles", () => {
    const blocks = [
      makeBlock("a", ["b"], 10),
      makeBlock("b", ["a"], 20),
    ];
    expect(() => topologicalSort(["a"], blocks)).toThrow("Circular dependency");
  });

  it("handles no dependencies", () => {
    const blocks = [makeBlock("a", [], 10)];
    const order = topologicalSort(["a"], blocks);
    expect(order).toEqual(["a"]);
  });
});
