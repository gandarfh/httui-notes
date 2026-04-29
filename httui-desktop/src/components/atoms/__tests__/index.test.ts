import { describe, it, expect } from "vitest";

import * as atoms from "@/components/atoms";

describe("atoms barrel", () => {
  it("re-exports Btn / Dot / Kbd", () => {
    expect(atoms.Btn).toBeDefined();
    expect(atoms.Dot).toBeDefined();
    expect(atoms.Kbd).toBeDefined();
  });
});
