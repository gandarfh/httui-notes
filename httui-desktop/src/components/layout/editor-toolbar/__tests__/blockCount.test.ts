import { describe, it, expect } from "vitest";

import { countExecutableBlocks } from "@/components/layout/editor-toolbar/blockCount";

describe("countExecutableBlocks", () => {
  it("returns 0 for an empty doc", () => {
    expect(countExecutableBlocks("")).toBe(0);
  });

  it("returns 0 for plain markdown with no fences", () => {
    expect(countExecutableBlocks("# Hello\n\nSome prose.")).toBe(0);
  });

  it("counts a single ```http block", () => {
    const doc = "# A\n\n```http alias=req1\nGET /\n```\n";
    expect(countExecutableBlocks(doc)).toBe(1);
  });

  it("counts a ```db block", () => {
    const doc = "```db alias=q1\nSELECT 1;\n```\n";
    expect(countExecutableBlocks(doc)).toBe(1);
  });

  it("counts ```db-postgres / ```db-mysql variants", () => {
    const doc =
      "```db-postgres conn=x\nSELECT 1;\n```\n\n```db-mysql conn=y\nSELECT 2;\n```\n";
    expect(countExecutableBlocks(doc)).toBe(2);
  });

  it("does NOT count plain ```js / ```python / ```sh fences", () => {
    const doc =
      "```js\nconsole.log(1);\n```\n\n```python\nprint(1)\n```\n\n```sh\necho 1\n```\n";
    expect(countExecutableBlocks(doc)).toBe(0);
  });

  it("does NOT count placeholder fences with executable=false", () => {
    // The placeholder kinds (mongodb / ws / graphql / sh from
    // AddBlockMenu) use ```mongodb / ```ws etc. — fence tokens not
    // in the executable set, so they're naturally excluded.
    const doc =
      "```mongodb alias=q1 executable=false\ndb.col.find({})\n```\n\n```graphql alias=q1 executable=false\nquery {}\n```\n";
    expect(countExecutableBlocks(doc)).toBe(0);
  });

  it("counts mixed http + db blocks correctly", () => {
    const doc = `# Doc

\`\`\`http alias=req1
GET /a
\`\`\`

prose

\`\`\`db alias=q1
SELECT 1;
\`\`\`

\`\`\`http alias=req2
POST /b
\`\`\`
`;
    expect(countExecutableBlocks(doc)).toBe(3);
  });

  it("a fence open without close still counts (truncated docs)", () => {
    const doc = "```http alias=req1\nGET /\n";
    expect(countExecutableBlocks(doc)).toBe(1);
  });
});
