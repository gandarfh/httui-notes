import { registry } from "../registry";
import { E2eBlock } from "./node";
import { E2eBlockView } from "./E2eBlockView";

registry.register({
  type: "e2e",
  node: E2eBlock,
  component: E2eBlockView,
  defaultAttrs: {
    blockType: "e2e",
    content: JSON.stringify({
      baseUrl: "",
      headers: [],
      steps: [],
    }),
  },
});

export { E2eBlock } from "./node";
export type { E2eBlockData, E2eStep, E2eStepResult, E2eResult } from "./types";
