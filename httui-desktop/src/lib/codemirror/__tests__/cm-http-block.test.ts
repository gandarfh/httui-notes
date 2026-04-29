import { describe, it, expect, beforeEach } from "vitest";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  findHttpBlocks,
  createHttpBlockExtension,
  getHttpWidgetContainers,
  getHttpPortalVersion,
  subscribeToHttpPortals,
  setHttpBlockActions,
} from "../cm-http-block";

const HTTP_DOC = `# API doc

Some text.

\`\`\`http alias=req1 timeout=5000 display=split
GET https://api.example.com/users?page=1
Authorization: Bearer xyz
\`\`\`

Trailing prose.

\`\`\`http alias=create
POST https://api.example.com/users
Content-Type: application/json

{"name":"alice"}
\`\`\`
`;

const MIXED_DOC = `\`\`\`db-postgres alias=db1
SELECT 1
\`\`\`

\`\`\`http alias=h1
GET https://example.com
\`\`\`

\`\`\`e2e alias=e1
{"steps":[]}
\`\`\`
`;

function createView(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [createHttpBlockExtension()],
  });
  return new EditorView({ state, parent: document.body });
}

describe("findHttpBlocks", () => {
  it("locates each http fenced block", () => {
    const blocks = findHttpBlocks(Text.of(HTTP_DOC.split("\n")));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].metadata.alias).toBe("req1");
    expect(blocks[0].metadata.timeoutMs).toBe(5000);
    expect(blocks[0].metadata.displayMode).toBe("split");
    expect(blocks[1].metadata.alias).toBe("create");
  });

  it("captures body text between fences", () => {
    const blocks = findHttpBlocks(Text.of(HTTP_DOC.split("\n")));
    expect(blocks[0].body).toContain(
      "GET https://api.example.com/users?page=1",
    );
    expect(blocks[0].body).toContain("Authorization: Bearer xyz");
    expect(blocks[1].body).toContain("POST https://api.example.com/users");
    expect(blocks[1].body).toContain('{"name":"alice"}');
  });

  it("ignores db and e2e fences", () => {
    const blocks = findHttpBlocks(Text.of(MIXED_DOC.split("\n")));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].metadata.alias).toBe("h1");
  });

  it("returns empty when there are no http blocks", () => {
    const blocks = findHttpBlocks(Text.of(["# Hello", "plain text"]));
    expect(blocks).toEqual([]);
  });
});

describe("HTTP portal registry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("registers a slot for each http block on mount", () => {
    const view = createView(HTTP_DOC);
    const containers = getHttpWidgetContainers();
    expect(containers.size).toBe(2);
    expect(containers.has("http_idx_0")).toBe(true);
    expect(containers.has("http_idx_1")).toBe(true);
    view.destroy();
  });

  it("each entry exposes the block metadata", () => {
    const view = createView(HTTP_DOC);
    const entry = getHttpWidgetContainers().get("http_idx_0");
    expect(entry).toBeDefined();
    expect(entry?.block.metadata.alias).toBe("req1");
    expect(entry?.block.body).toContain("GET https://api.example.com");
    view.destroy();
  });

  it("increments portalVersion when blocks register", () => {
    const before = getHttpPortalVersion();
    const view = createView(HTTP_DOC);
    expect(getHttpPortalVersion()).toBeGreaterThan(before);
    view.destroy();
  });

  it("notifies subscribers when blocks register", () => {
    let notified = 0;
    const unsub = subscribeToHttpPortals(() => {
      notified++;
    });
    const view = createView(HTTP_DOC);
    expect(notified).toBeGreaterThan(0);
    view.destroy();
    unsub();
  });

  it("clears registry when the editor is destroyed", () => {
    const view = createView(HTTP_DOC);
    expect(getHttpWidgetContainers().size).toBe(2);
    view.destroy();
    expect(getHttpWidgetContainers().size).toBe(0);
  });

  it("setHttpBlockActions merges callbacks into the entry", () => {
    const view = createView(HTTP_DOC);
    let runs = 0;
    setHttpBlockActions("http_idx_0", { onRun: () => runs++ });
    const entry = getHttpWidgetContainers().get("http_idx_0");
    entry?.actions.onRun?.();
    expect(runs).toBe(1);
    view.destroy();
  });
});

describe("form mode (mode=form in info string)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // Leading prose forces a doc offset OUTSIDE the block at position 0,
  // matching real-world usage and letting us test reading-mode rendering.
  const FORM_DOC = `Some prose

\`\`\`http alias=req1 mode=form
GET https://api.example.com/users
Authorization: Bearer xyz
\`\`\`
`;

  const RAW_DOC = `Some prose

\`\`\`http alias=req1
GET https://api.example.com/users
Authorization: Bearer xyz
\`\`\`
`;

  it("parses mode=form from the info string", () => {
    const blocks = findHttpBlocks(Text.of(FORM_DOC.split("\n")));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].metadata.mode).toBe("form");
  });

  it("default (no mode= token) is treated as raw", () => {
    const blocks = findHttpBlocks(Text.of(RAW_DOC.split("\n")));
    expect(blocks[0].metadata.mode).toBeUndefined();
  });

  it("registers the form slot when mode=form and cursor is outside", () => {
    const view = createView(FORM_DOC);
    // Move selection to position 0 (outside the block).
    view.dispatch({ selection: { anchor: 0 } });
    const entry = getHttpWidgetContainers().get("http_idx_0");
    expect(entry).toBeDefined();
    expect(entry?.form).toBeInstanceOf(HTMLElement);
    view.destroy();
  });

  it("does NOT register the form slot when mode=raw (or unset)", () => {
    const view = createView(RAW_DOC);
    view.dispatch({ selection: { anchor: 0 } });
    const entry = getHttpWidgetContainers().get("http_idx_0");
    expect(entry?.form).toBeUndefined();
    view.destroy();
  });

  it("hides the form slot when the cursor enters the block (editing mode)", () => {
    const view = createView(FORM_DOC);
    // Position cursor outside first to register form, then move it into
    // the body to flip into editing mode.
    view.dispatch({ selection: { anchor: 0 } });
    expect(getHttpWidgetContainers().get("http_idx_0")?.form).toBeDefined();

    // Move cursor into the body of the http block (line 4 = GET ...).
    const insidePos = view.state.doc.line(4).from + 1;
    view.dispatch({ selection: { anchor: insidePos } });
    expect(getHttpWidgetContainers().get("http_idx_0")?.form).toBeUndefined();
    view.destroy();
  });
});
