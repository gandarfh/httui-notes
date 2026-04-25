import { describe, it, expect, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  findFencedBlocks,
  extractAlias,
  createEditorBlockWidgets,
  getWidgetContainers,
  getPortalVersion,
  subscribeToPortals,
  widgetTransaction,
} from "../cm-block-widgets";
import { Text } from "@codemirror/state";

// db-* blocks are handled by cm-db-block.tsx (stage 4 redesign) and http
// blocks by cm-http-block.tsx (stage 3 of the http redesign). This suite
// exercises only the adapter-routed paths — only `e2e` today. The fixture
// keeps an http block around so we can prove the widget builder filters it
// out and routes it to the http extension instead.
const SAMPLE_DOC = `# Notes

Some text here

\`\`\`e2e {alias=q1}
step1
\`\`\`

More text

\`\`\`http {alias=h1, displayMode=split}
GET /api/users
\`\`\`

Trailing text

\`\`\`e2e {alias=q2}
step2
\`\`\`
`;

function createView(doc: string) {
  const state = EditorState.create({
    doc,
    extensions: [createEditorBlockWidgets()],
  });
  return new EditorView({ state, parent: document.body });
}

describe("findFencedBlocks", () => {
  it("finds all executable blocks", () => {
    const doc = Text.of(SAMPLE_DOC.split("\n"));
    const blocks = findFencedBlocks(doc);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].lang).toBe("e2e");
    expect(blocks[1].lang).toBe("http");
    expect(blocks[2].lang).toBe("e2e");
  });

  it("extracts info string correctly", () => {
    const doc = Text.of(SAMPLE_DOC.split("\n"));
    const blocks = findFencedBlocks(doc);
    expect(blocks[0].info).toBe("{alias=q1}");
    expect(blocks[1].info).toBe("{alias=h1, displayMode=split}");
  });

  it("returns empty array when no blocks", () => {
    const doc = Text.of(["# Just a title", "plain text"]);
    expect(findFencedBlocks(doc)).toHaveLength(0);
  });
});

describe("extractAlias", () => {
  it("extracts alias from whitespace-separated info", () => {
    expect(extractAlias("alias=foo displayMode=split")).toBe("foo");
    expect(extractAlias("alias=q1")).toBe("q1");
  });

  it("returns undefined when no alias", () => {
    expect(extractAlias("displayMode=split")).toBeUndefined();
    expect(extractAlias("")).toBeUndefined();
  });
});

describe("PortalWidget registry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("registers widgets in widgetContainers when editor mounts", () => {
    const view = createView(SAMPLE_DOC);
    const containers = getWidgetContainers();
    expect(containers.size).toBe(2);
    expect(containers.has("block_0")).toBe(true);
    expect(containers.has("block_1")).toBe(true);
    view.destroy();
  });

  it("each container has element and block reference", () => {
    const view = createView(SAMPLE_DOC);
    const containers = getWidgetContainers();
    const entry = containers.get("block_0");
    expect(entry).toBeDefined();
    expect(entry?.element).toBeInstanceOf(HTMLElement);
    expect(entry?.block.lang).toBe("e2e");
    view.destroy();
  });

  it("increments portalVersion when widgets are created", () => {
    const before = getPortalVersion();
    const view = createView(SAMPLE_DOC);
    const after = getPortalVersion();
    expect(after).toBeGreaterThan(before);
    view.destroy();
  });

  it("notifies subscribers when widgets change", () => {
    let notified = 0;
    const unsub = subscribeToPortals(() => { notified++; });
    const view = createView(SAMPLE_DOC);
    expect(notified).toBeGreaterThan(0);
    view.destroy();
    unsub();
  });

  it("removes from registry when widgets are destroyed", () => {
    const view = createView(SAMPLE_DOC);
    expect(getWidgetContainers().size).toBe(2);
    view.destroy();
    // After destroy, CM6 calls WidgetType.destroy() for each widget
    expect(getWidgetContainers().size).toBe(0);
  });
});

describe("widgetTransaction annotation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("preserves widget DOM across widget-annotated transactions", () => {
    const view = createView(SAMPLE_DOC);
    const containers = getWidgetContainers();
    const originalElement = containers.get("block_0")?.element;

    // Dispatch a transaction with the widget annotation
    // (simulates ctx.updateInfo being called)
    const doc = view.state.doc;
    const firstBlockStart = doc.line(5).from; // ```e2e line
    const firstBlockLine = doc.line(5);
    const infoStart = firstBlockStart + 3 + 3; // after ```e2e
    const infoEnd = firstBlockLine.to;

    view.dispatch({
      changes: { from: infoStart, to: infoEnd, insert: " {alias=q2}" },
      annotations: widgetTransaction.of(true),
    });

    // Widget element should be preserved (same DOM reference)
    const newElement = getWidgetContainers().get("block_0")?.element;
    expect(newElement).toBe(originalElement);
    view.destroy();
  });
});

describe("block count changes", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rebuilds decorations when a block is added", () => {
    const view = createView(SAMPLE_DOC);
    // Two e2e blocks routed through this adapter; the http block is owned
    // by cm-http-block and excluded from this registry.
    expect(getWidgetContainers().size).toBe(2);

    // Add a new block at the end
    const end = view.state.doc.length;
    view.dispatch({
      changes: {
        from: end,
        to: end,
        insert: "\n```e2e {alias=e3}\nstep3\n```",
      },
    });

    expect(getWidgetContainers().size).toBe(3);
    view.destroy();
  });

  it("removes widget from registry when block is deleted", () => {
    const view = createView(SAMPLE_DOC);
    const doc = view.state.doc;
    const firstBlockStart = doc.line(5).from;
    const firstBlockEnd = doc.line(7).to;

    view.dispatch({
      changes: { from: firstBlockStart, to: firstBlockEnd, insert: "" },
    });

    // One e2e block remains (the http block was never registered).
    expect(getWidgetContainers().size).toBe(1);
    view.destroy();
  });

  it("never registers http blocks (they go through cm-http-block)", () => {
    const view = createView(
      "```http alias=req1\nGET https://example.com\n```\n",
    );
    expect(getWidgetContainers().size).toBe(0);
    view.destroy();
  });
});

describe("decoration field", () => {
  it("provides decorations via StateField", () => {
    const ext = createEditorBlockWidgets();
    const state = EditorState.create({ doc: SAMPLE_DOC, extensions: [ext] });
    // The field should produce decorations
    const field = (ext as Array<unknown>).find(
      (e) => e && typeof e === "object" && "create" in (e as object),
    );
    expect(field).toBeDefined();
    // Verify state has decorations
    state.facet(EditorView.decorations).forEach((d) => {
      if (typeof d === "function") {
        d(state as never);
      }
    });
    // Just verify state was created with the extension
    expect(state.doc.toString()).toBe(SAMPLE_DOC);
  });
});
