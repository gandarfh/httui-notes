import { registry } from "../registry";
import { HttpBlock } from "./node";
import { HttpBlockView } from "./HttpBlockView";

registry.register({
  type: "http",
  node: HttpBlock,
  component: HttpBlockView,
  defaultAttrs: {
    blockType: "http",
    content: JSON.stringify({
      method: "GET",
      url: "",
      params: [],
      headers: [],
      body: "",
    }),
  },
});

export { HttpBlock } from "./node";
export type { HttpBlockData, HttpResponse, HttpMethod } from "./types";
