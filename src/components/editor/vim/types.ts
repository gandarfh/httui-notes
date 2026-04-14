import type { Editor } from "@tiptap/core";

export enum VimMode {
  Normal = "normal",
  Insert = "insert",
  Visual = "visual",
}

export type VimCommand = (editor: Editor) => boolean;

export interface VimKeyBinding {
  key: string;
  mode: VimMode;
  command: VimCommand;
}
