import type { Node } from "@tiptap/core";
import type { ComponentType } from "react";

export interface BlockProps {
  node: Node;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}

export interface BlockRegistration {
  type: string;
  node: Node;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  defaultAttrs: Record<string, unknown>;
}

class BlockRegistry {
  private blocks = new Map<string, BlockRegistration>();

  register(reg: BlockRegistration) {
    this.blocks.set(reg.type, reg);
  }

  getExtensions(): Node[] {
    return [...this.blocks.values()].map((b) => b.node);
  }

  getComponent(type: string) {
    return this.blocks.get(type)?.component;
  }

  getAll() {
    return [...this.blocks.values()];
  }
}

export const registry = new BlockRegistry();
