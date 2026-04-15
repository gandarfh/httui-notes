import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import type { Editor, Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import {
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  useRef,
} from "react";
import { Box } from "@chakra-ui/react";

interface WikilinkSuggestionItem {
  name: string;
  path: string;
}

export interface WikilinkSuggestOptions {
  getFiles: () => WikilinkSuggestionItem[];
}

interface WikilinkMenuProps {
  items: WikilinkSuggestionItem[];
  command: (item: WikilinkSuggestionItem) => void;
}

const WikilinkMenu = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  WikilinkMenuProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback(
    ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        if (items[selectedIndex]) command(items[selectedIndex]);
        return true;
      }
      return false;
    },
    [items, selectedIndex, command],
  );

  useImperativeHandle(ref, () => ({ onKeyDown }), [onKeyDown]);

  if (items.length === 0) return null;

  return (
    <Box
      bg="bg.panel"
      border="1px solid"
      borderColor="border"
      rounded="md"
      shadow="lg"
      maxH="200px"
      overflowY="auto"
      py={1}
      ref={listRef}
    >
      {items.map((item, index) => (
        <Box
          key={item.path}
          px={3}
          py={1.5}
          fontSize="sm"
          cursor="pointer"
          bg={index === selectedIndex ? "bg.subtle" : undefined}
          _hover={{ bg: "bg.subtle" }}
          onClick={() => command(item)}
        >
          {item.name}
        </Box>
      ))}
    </Box>
  );
});

WikilinkMenu.displayName = "WikilinkMenu";

export function createWikilinkSuggest(options: WikilinkSuggestOptions) {
  return Extension.create({
    name: "wikilinkSuggest",

    addProseMirrorPlugins() {
      return [
        Suggestion({
          pluginKey: new PluginKey("wikilinkSuggestion"),
          editor: this.editor,
          char: "[[",
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: Range;
            props: WikilinkSuggestionItem;
          }) => {
            // Remove the [[ trigger and insert a wikilink node
            const label = props.name.replace(/\.md$/, "");
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: "wikilink",
                attrs: { target: props.path, label },
              })
              .run();
          },
          items: ({ query }: { query: string }) => {
            const files = options.getFiles();
            if (!query) return files.slice(0, 10);
            const q = query.toLowerCase();
            return files
              .filter((f) => f.name.toLowerCase().includes(q))
              .slice(0, 10);
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let wrapper: HTMLDivElement | null = null;

            return {
              onStart: (props) => {
                component = new ReactRenderer(WikilinkMenu, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                wrapper = document.createElement("div");
                wrapper.style.position = "fixed";
                wrapper.style.zIndex = "9999";
                wrapper.appendChild(component.element);
                document.body.appendChild(wrapper);

                const rect = (props.clientRect as () => DOMRect)();
                wrapper.style.left = `${rect.left}px`;
                wrapper.style.top = `${rect.bottom + 4}px`;
              },

              onUpdate: (props) => {
                component?.updateProps(props);
                if (!props.clientRect || !wrapper) return;
                const rect = (props.clientRect as () => DOMRect)();
                wrapper.style.left = `${rect.left}px`;
                wrapper.style.top = `${rect.bottom + 4}px`;
              },

              onKeyDown: (props) => {
                if (props.event.key === "Escape") {
                  wrapper?.remove();
                  wrapper = null;
                  return true;
                }
                const ref = component?.ref as {
                  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
                } | null;
                return ref?.onKeyDown(props) ?? false;
              },

              onExit: () => {
                wrapper?.remove();
                wrapper = null;
                component?.destroy();
              },
            };
          },
        }),
      ];
    },
  });
}
