import { registry } from "../registry";
import { DbBlock } from "./node";
import { DbBlockView } from "./DbBlockView";

registry.register({
  type: "db",
  node: DbBlock,
  component: DbBlockView,
  defaultAttrs: {
    blockType: "db",
    content: JSON.stringify({
      connectionId: "",
      query: "",
    }),
  },
});

export { DbBlock } from "./node";
export type { DbBlockData, DbResponse, DbSelectResponse, DbMutationResponse } from "./types";
