/**
 * Browser mode test — reproduces the scroll reset bug that happens
 * when a block widget grows (e.g., after query execution adds results).
 *
 * Uses real Chromium layout so CM6's measure phase runs with real
 * offsetHeight/scrollTop values — impossible to simulate in jsdom.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEditorBlockWidgets, getWidgetContainers } from "../cm-block-widgets";

// Long document with a block in the middle so we have room to scroll
function buildDoc(blockAtLine: number, totalLines: number): string {
  const lines: string[] = [];
  for (let i = 0; i < totalLines; i++) {
    if (i === blockAtLine) {
      lines.push("```db {alias=q1}");
      lines.push("SELECT * FROM users");
      lines.push("```");
    } else {
      lines.push(`line ${i} — some content to make the doc scrollable`);
    }
  }
  return lines.join("\n");
}

async function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitFrames(n: number) {
  for (let i = 0; i < n; i++) await nextFrame();
}

describe("CM6 widget height change scroll bug", () => {
  let container: HTMLDivElement;
  let view: EditorView;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "600px";
    container.style.height = "400px";
    container.style.overflow = "hidden";
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    document.body.appendChild(container);
  });

  afterEach(() => {
    view?.destroy();
    container.remove();
  });

  it("does NOT reset scroll to 0 when a widget above the viewport grows", async () => {
    const state = EditorState.create({
      doc: buildDoc(10, 100),
      extensions: [
        createEditorBlockWidgets(),
        EditorView.theme({
          "&": { height: "400px" },
          ".cm-scroller": { overflow: "auto" },
        }),
      ],
    });
    view = new EditorView({ state, parent: container });

    // Wait for layout
    await waitFrames(3);

    // Get the widget element
    const widgetEntry = getWidgetContainers().get("block_0");
    expect(widgetEntry).toBeDefined();
    const widgetEl = widgetEntry!.element;

    // Scroll so the block is ABOVE the viewport (simulate user scrolled past)
    view.scrollDOM.scrollTop = 600;
    await waitFrames(3);
    const beforeScroll = view.scrollDOM.scrollTop;
    expect(beforeScroll).toBeGreaterThan(100);

    // Simulate block execution: widget grows dramatically (e.g., results table)
    widgetEl.style.minHeight = "500px";
    widgetEl.innerHTML = "<div style='height: 500px; background: red'>Results table</div>";

    // Wait for ResizeObserver to fire and CM6 measure to run
    await waitFrames(5);

    // Trigger a scroll event (this is what the user does — scrolling a bit
    // triggers CM6's onScrollChanged → measure → miscalculation → scrollTop = 0)
    view.scrollDOM.dispatchEvent(new Event("scroll"));
    await waitFrames(3);

    // ASSERTION: scroll should NOT have been reset to 0
    expect(view.scrollDOM.scrollTop).not.toBe(0);
    expect(view.scrollDOM.scrollTop).toBeGreaterThan(100);
  });

});
