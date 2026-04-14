import { usePaneContext } from "@/contexts/PaneContext";
import { PaneNode } from "./PaneNode";

export function PaneContainer() {
  const { layout } = usePaneContext();
  return <PaneNode layout={layout} path={[]} />;
}
