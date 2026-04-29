import { memo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Box, IconButton } from "@chakra-ui/react";
import { LuCopy, LuCheck } from "react-icons/lu";
import { useState } from "react";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

function hastToHtml(nodes: unknown[]): string {
  return (
    nodes as Array<{
      type: string;
      value?: string;
      properties?: { className?: string[] };
      children?: unknown[];
    }>
  )
    .map((node) => {
      if (node.type === "text") return node.value ?? "";
      if (node.type === "element") {
        const cls = node.properties?.className?.join(" ") ?? "";
        const inner = hastToHtml(node.children ?? []);
        return cls ? `<span class="${cls}">${inner}</span>` : inner;
      }
      return "";
    })
    .join("");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <IconButton
      aria-label="Copy code"
      size="2xs"
      variant="ghost"
      position="absolute"
      top={1}
      right={1}
      opacity={0}
      _groupHover={{ opacity: 1 }}
      onClick={handleCopy}
    >
      {copied ? <LuCheck /> : <LuCopy />}
    </IconButton>
  );
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const lang = className?.replace("language-", "") ?? "";
  const code = String(children).replace(/\n$/, "");

  let highlighted = code;
  try {
    if (lang && lowlight.registered(lang)) {
      highlighted = hastToHtml(
        lowlight.highlight(lang, code).children as unknown[],
      );
    }
  } catch {
    // Fallback to plain text
  }

  return (
    <Box position="relative" role="group">
      <CopyButton text={code} />
      <Box
        as="pre"
        bg="bg.subtle"
        border="1px solid"
        borderColor="border"
        rounded="md"
        p={3}
        fontSize="xs"
        fontFamily="mono"
        overflowX="auto"
        css={{ "& code": { bg: "transparent", p: 0 } }}
      >
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </Box>
    </Box>
  );
}

function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <Box
      as="code"
      bg="bg.subtle"
      px={1}
      py={0.5}
      rounded="sm"
      fontSize="xs"
      fontFamily="mono"
    >
      {children}
    </Box>
  );
}

interface ChatMarkdownProps {
  content: string;
}

export const ChatMarkdown = memo(function ChatMarkdown({
  content,
}: ChatMarkdownProps) {
  return (
    <Box
      fontSize="sm"
      lineHeight="tall"
      css={{
        "& p": { mb: "8px" },
        "& p:last-child": { mb: 0 },
        "& ul, & ol": { pl: "20px", mb: "8px" },
        "& li": { mb: "2px" },
        "& h1, & h2, & h3, & h4": { fontWeight: "bold", mt: "12px", mb: "4px" },
        "& h1": { fontSize: "lg" },
        "& h2": { fontSize: "md" },
        "& h3": { fontSize: "sm" },
        "& blockquote": {
          borderLeft: "3px solid var(--chakra-colors-border)",
          pl: "12px",
          color: "var(--chakra-colors-fg-muted)",
          my: "8px",
        },
        "& table": {
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "xs",
          my: "8px",
        },
        "& th, & td": {
          border: "1px solid var(--chakra-colors-border)",
          px: "8px",
          py: "4px",
          textAlign: "left",
        },
        "& th": {
          bg: "var(--chakra-colors-bg-subtle)",
          fontWeight: "semibold",
        },
        "& a": { color: "blue.400", textDecoration: "underline" },
        "& hr": { borderColor: "var(--chakra-colors-border)", my: "12px" },
        "& input[type='checkbox']": { mr: "6px" },
        // highlight.js classes
        "& .hljs-keyword": { color: "var(--chakra-colors-purple-400)" },
        "& .hljs-string": { color: "var(--chakra-colors-green-400)" },
        "& .hljs-comment": {
          color: "var(--chakra-colors-fg-muted)",
          fontStyle: "italic",
        },
        "& .hljs-number": { color: "var(--chakra-colors-orange-400)" },
        "& .hljs-type, & .hljs-built_in": {
          color: "var(--chakra-colors-cyan-400)",
        },
        "& .hljs-attr, & .hljs-attribute": {
          color: "var(--chakra-colors-blue-400)",
        },
        "& .hljs-literal": { color: "var(--chakra-colors-red-400)" },
        "& .hljs-title": { color: "var(--chakra-colors-yellow-400)" },
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code: ({ className, children }) => {
            const isInline = !className;
            if (isInline) {
              return <InlineCode>{children}</InlineCode>;
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                if (href) {
                  import("@tauri-apps/plugin-shell").then((mod) =>
                    mod.open(href),
                  );
                }
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
});
