import { useState } from "react";
import { Box, Flex, Text, HStack, Link, SimpleGrid, Badge } from "@chakra-ui/react";
import { LuDownload, LuMenu, LuX, LuStar, LuTerminal, LuLock, LuZap, LuGitBranch } from "react-icons/lu";
import { MockHttpBlock } from "./mocks/HttpBlock";
import { MockDbBlock } from "./mocks/DbBlock";
import { MockE2eBlock } from "./mocks/E2eBlock";
import { MockReferenceBlock } from "./mocks/ReferenceBlock";
import { MockChatPanel } from "./mocks/ChatPanel";
import { AppChrome } from "./mocks/AppChrome";
import { ScrollReveal } from "./mocks/ScrollReveal";

// ─── Shared primitives ──────────────────────────────────
function Eyebrow({ children, color = "brand.300" }: { children: React.ReactNode; color?: string }) {
  return (
    <Text
      as="span"
      fontFamily="mono"
      fontSize="xs"
      fontWeight="600"
      color={color}
      letterSpacing="0.08em"
      textTransform="uppercase"
    >
      {children}
    </Text>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  maxW = "640px",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  maxW?: string;
}) {
  return (
    <Flex direction="column" gap={3} align={align === "center" ? "center" : "flex-start"} textAlign={align} mx={align === "center" ? "auto" : undefined} maxW={maxW}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Text as="h2" fontFamily="heading" fontSize={{ base: "2xl", md: "4xl" }} fontWeight="900" color="fg" letterSpacing="-0.03em" lineHeight="1.1">
        {title}
      </Text>
      {description && (
        <Text fontSize={{ base: "sm", md: "md" }} color="fg.muted" lineHeight="1.7" maxW="560px">
          {description}
        </Text>
      )}
    </Flex>
  );
}

// ─── Nav ────────────────────────────────────────────────
function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box position="fixed" top={0} left={0} right={0} zIndex={100} bg="bg/80" backdropFilter="blur(12px)" borderBottom="1px solid" borderColor="border">
      <Flex align="center" justify="space-between" maxW="1200px" mx="auto" px={6} h="56px">
        <HStack gap={2}>
          <Text fontFamily="heading" fontWeight="900" fontSize="xl" color="fg" letterSpacing="-0.02em">httui</Text>
          <Badge size="xs" variant="subtle" colorPalette="gray" fontFamily="mono" fontSize="2xs" fontWeight="500">v0.1</Badge>
        </HStack>

        {/* Desktop nav */}
        <HStack gap={6} display={{ base: "none", md: "flex" }}>
          <Link href="#features" fontSize="sm" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }}>Features</Link>
          <Link href="#ai" fontSize="sm" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }}>AI</Link>
          <Link href="#local" fontSize="sm" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }}>Local-first</Link>
          <Link href="https://github.com/gandarfh/httui-notes" target="_blank" rel="noopener" fontSize="sm" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }}>GitHub</Link>
          <Link href="https://github.com/gandarfh/httui-notes/releases" target="_blank" rel="noopener" px={4} py={1.5} rounded="md" bg="brand.400" color="brand.950" fontSize="sm" fontWeight="600" _hover={{ bg: "brand.500", textDecoration: "none" }}>
            Download
          </Link>
        </HStack>

        {/* Mobile toggle */}
        <Box as="button" display={{ base: "block", md: "none" }} cursor="pointer" color="fg.muted" p={1} bg="transparent" border="none" aria-label={mobileOpen ? "Close menu" : "Open menu"} onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <LuX size={20} /> : <LuMenu size={20} />}
        </Box>
      </Flex>

      {/* Mobile menu */}
      {mobileOpen && (
        <Flex direction="column" gap={4} px={6} pb={5} display={{ base: "flex", md: "none" }} bg="bg" borderBottom="1px solid" borderColor="border">
          <Link href="#features" fontSize="sm" color="fg.muted" onClick={() => setMobileOpen(false)}>Features</Link>
          <Link href="#ai" fontSize="sm" color="fg.muted" onClick={() => setMobileOpen(false)}>AI</Link>
          <Link href="#local" fontSize="sm" color="fg.muted" onClick={() => setMobileOpen(false)}>Local-first</Link>
          <Link href="https://github.com/gandarfh/httui-notes" target="_blank" rel="noopener" fontSize="sm" color="fg.muted">GitHub</Link>
          <Link href="https://github.com/gandarfh/httui-notes/releases" target="_blank" rel="noopener" display="inline-flex" alignItems="center" justifyContent="center" gap={2} px={4} py={2} rounded="md" bg="brand.400" color="brand.950" fontSize="sm" fontWeight="600">
            <LuDownload size={14} /> Download
          </Link>
        </Flex>
      )}
    </Box>
  );
}

// ─── Hero ───────────────────────────────────────────────
function Hero() {
  return (
    <Box pt={{ base: "120px", md: "140px" }} pb={{ base: 12, md: 20 }} px={6} position="relative" overflow="hidden">
      {/* ambient background glow */}
      <Box
        position="absolute"
        top="-200px"
        left="50%"
        transform="translateX(-50%)"
        w="800px"
        h="600px"
        bg="radial-gradient(ellipse at center, rgba(236, 154, 56, 0.08), transparent 70%)"
        pointerEvents="none"
        aria-hidden
      />

      <Flex direction="column" align="center" maxW="1200px" mx="auto" gap={{ base: 10, md: 14 }} position="relative">
        <Flex direction="column" align="center" textAlign="center" maxW="720px" gap={5}>
          <ScrollReveal distance={12} duration={0.5}>
            <HStack
              gap={2}
              px={3}
              py={1.5}
              rounded="full"
              border="1px solid"
              borderColor="border"
              bg="bg.subtle"
              fontSize="xs"
              color="fg.muted"
            >
              <Box w={1.5} h={1.5} rounded="full" bg="green.400" boxShadow="0 0 8px currentColor" />
              <Text fontFamily="mono" fontSize="xs">Now in public beta · open source</Text>
            </HStack>
          </ScrollReveal>

          <ScrollReveal distance={16} duration={0.6} delay={80}>
            <Text as="h1" fontFamily="heading" fontSize={{ base: "5xl", md: "7xl" }} fontWeight="900" color="fg" lineHeight="1" letterSpacing="-0.045em">
              Your API docs,
              <br />
              <Text as="span" css={{ background: "linear-gradient(to right, var(--chakra-colors-brand-300), var(--chakra-colors-brand-500))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                alive.
              </Text>
            </Text>
          </ScrollReveal>

          <ScrollReveal distance={16} duration={0.6} delay={160}>
            <Text fontSize={{ base: "md", md: "lg" }} color="fg.muted" maxW="560px" lineHeight="1.6">
              A markdown editor with a runtime inside.
              Write the doc, hit run, ship the proof.
            </Text>
          </ScrollReveal>

          <ScrollReveal distance={12} duration={0.5} delay={240}>
            <Flex direction="column" align="center" gap={3}>
              <Flex gap={3} wrap="wrap" justify="center">
                <Link href="https://github.com/gandarfh/httui-notes/releases" target="_blank" rel="noopener" display="flex" alignItems="center" gap={2} px={6} py={3} rounded="md" bg="brand.400" color="brand.950" fontWeight="700" fontSize="sm" _hover={{ bg: "brand.500", textDecoration: "none", transform: "translateY(-1px)" }} transition="all 0.15s" boxShadow="0 4px 20px rgba(236, 154, 56, 0.25)">
                  <LuDownload size={16} /> Download for macOS
                </Link>
                <Link href="https://github.com/gandarfh/httui-notes" target="_blank" rel="noopener" display="flex" alignItems="center" gap={2} px={6} py={3} rounded="md" border="1px solid" borderColor="border" color="fg" fontWeight="600" fontSize="sm" _hover={{ borderColor: "fg.muted", textDecoration: "none", bg: "bg.subtle" }} transition="all 0.15s">
                  <LuStar size={14} /> Star on GitHub
                </Link>
              </Flex>
              <HStack gap={4} fontSize="xs" color="fg.muted" fontFamily="mono">
                <Text>macOS</Text>
                <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
                <Text>Linux</Text>
                <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
                <Text>~15MB binary</Text>
              </HStack>
            </Flex>
          </ScrollReveal>
        </Flex>

        {/* Hero — full app chrome with HTTP block */}
        <Box w="100%">
          <ScrollReveal distance={40} duration={0.8} delay={320}>
            <Box maxW="1100px" mx="auto" overflowX="auto">
              <AppChrome>
                <Text fontFamily="heading" fontSize="xl" fontWeight="800" color="fg" mb={1}>User API</Text>
                <Text fontSize="sm" color="fg.muted" mb={4}>Create and retrieve users from the REST API.</Text>
                <MockHttpBlock
                  alias="create-user"
                  method="POST"
                  url="{{base_url}}/api/users"
                  activeTab="Body"
                  defaultMode="split"
                  body={`{
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "role": "admin"
}`}
                  response={{
                    status: 201,
                    statusText: "Created",
                    elapsed: "142ms",
                    size: "128 B",
                    body: `{
  "id": 42,
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "role": "admin",
  "created_at": "2026-04-19T10:30:00Z"
}`,
                  }}
                />
              </AppChrome>
            </Box>
          </ScrollReveal>
        </Box>
      </Flex>
    </Box>
  );
}

// ─── Problem / Solution band ────────────────────────────
function ProblemBand() {
  const rows = [
    { before: "Document APIs in Notion", after: "Docs that execute" },
    { before: "Test requests in Postman", after: "Requests next to the docs" },
    { before: "Query the DB in DBeaver", after: "SQL in the same file" },
    { before: "Chain calls in a shell script", after: "Blocks reference blocks" },
  ];

  return (
    <Box py={{ base: 16, md: 24 }} px={6} bg="bg.subtle" borderTop="1px solid" borderBottom="1px solid" borderColor="border">
      <Box maxW="1000px" mx="auto">
        <ScrollReveal distance={16}>
          <SectionHeading
            eyebrow="// the problem"
            title={<>Four apps. Four tabs. One workflow that <Text as="span" color="brand.300">doesn't fit</Text>.</>}
            description="You write docs in one tool, fire requests in another, query the DB in a third, and keep environment variables somewhere in a YAML you edit by hand. httui is what you get when all four collapse into a single markdown file."
            maxW="780px"
          />
        </ScrollReveal>

        <ScrollReveal distance={16} delay={120}>
          <Box
            mt={12}
            border="1px solid"
            borderColor="border"
            rounded="lg"
            overflow="hidden"
            bg="bg"
          >
            <Flex
              px={5}
              py={3}
              borderBottom="1px solid"
              borderColor="border"
              bg="bg.subtle"
              fontSize="xs"
              fontFamily="mono"
              color="fg.muted"
              justify="space-between"
            >
              <Text>Before</Text>
              <Text color="brand.300">With httui</Text>
            </Flex>
            {rows.map((row, i) => (
              <Flex
                key={i}
                px={5}
                py={4}
                borderBottom={i < rows.length - 1 ? "1px solid" : "none"}
                borderColor="border"
                justify="space-between"
                align="center"
                gap={4}
                _hover={{ bg: "bg.subtle" }}
                transition="background 0.15s"
              >
                <Text fontSize="sm" color="fg.muted" textDecoration="line-through" textDecorationColor="fg.muted" opacity={0.7}>{row.before}</Text>
                <Text fontFamily="mono" fontSize="xs" color="fg.muted">→</Text>
                <Text fontSize="sm" color="fg" fontWeight="500" textAlign="right">{row.after}</Text>
              </Flex>
            ))}
          </Box>
        </ScrollReveal>
      </Box>
    </Box>
  );
}

// ─── Features: group A (2-up grid) ──────────────────────
function FeaturesGrid() {
  return (
    <Box pt={{ base: 16, md: 24 }} pb={8} px={6} id="features">
      <Box maxW="1100px" mx="auto">
        <ScrollReveal distance={16}>
          <SectionHeading
            eyebrow="// execute anything"
            title="The block is the unit of work."
            description="Every runnable thing in httui is a block: an HTTP call, a SQL query, an E2E flow. Blocks live inline in your markdown, cache their results, and reference each other."
          />
        </ScrollReveal>

        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={{ base: 8, lg: 10 }} mt={12}>
          {/* HTTP */}
          <ScrollReveal distance={20} delay={60}>
            <Flex direction="column" gap={4} h="full">
              <HStack gap={3}>
                <Box px={2} py={1} rounded="sm" bg="brand.400" color="brand.950" fontFamily="mono" fontSize="2xs" fontWeight="700">HTTP</Box>
                <Text fontFamily="heading" fontSize="lg" fontWeight="800" color="fg">Fire requests inline</Text>
              </HStack>
              <Text fontSize="sm" color="fg.muted" lineHeight="1.6">
                GET through OPTIONS. Environment variables, headers, body editor. Results cached by content hash — rerun only what changed.
              </Text>
              <Box>
                <MockHttpBlock
                  alias="list-users"
                  method="GET"
                  url="{{base_url}}/api/users?role=admin"
                  activeTab="Headers"
                  headers={[{ key: "Authorization", value: "Bearer {{auth_token}}" }, { key: "Content-Type", value: "application/json" }]}
                  response={{
                    status: 200,
                    statusText: "OK",
                    elapsed: "89ms",
                    size: "2.4 KB",
                    body: `[\n  { "id": 1, "name": "Alice", "role": "admin" },\n  { "id": 2, "name": "Bob",   "role": "admin" }\n]`,
                  }}
                />
              </Box>
            </Flex>
          </ScrollReveal>

          {/* DB */}
          <ScrollReveal distance={20} delay={140}>
            <Flex direction="column" gap={4} h="full">
              <HStack gap={3}>
                <Box px={2} py={1} rounded="sm" bg="blue.400" color="blue.950" fontFamily="mono" fontSize="2xs" fontWeight="700">DB</Box>
                <Text fontFamily="heading" fontSize="lg" fontWeight="800" color="fg">Query the database</Text>
              </HStack>
              <Text fontSize="sm" color="fg.muted" lineHeight="1.6">
                Postgres, MySQL, SQLite. Schema-aware autocomplete. Credentials in the OS keychain — never in a dotfile.
              </Text>
              <Box >
                <MockDbBlock
                  alias="recent-orders"
                  connection="Local PostgreSQL"
                  query={`SELECT u.name, u.email,\n       COUNT(o.id) as orders,\n       SUM(o.total) as revenue\nFROM users u\nJOIN orders o ON u.id = o.user_id\nGROUP BY u.id\nORDER BY revenue DESC\nLIMIT 5;`}
                  columns={[{ name: "name", type: "varchar" }, { name: "email", type: "varchar" }, { name: "orders", type: "int8" }, { name: "revenue", type: "numeric" }]}
                  rows={[
                    { name: "Alice Johnson", email: "alice@example.com", orders: 28, revenue: "$4,320.00" },
                    { name: "Bob Smith", email: "bob@example.com", orders: 15, revenue: "$2,180.50" },
                    { name: "Carol White", email: "carol@example.com", orders: 12, revenue: "$1,890.00" },
                  ]}
                  totalRows={3}
                />
              </Box>
            </Flex>
          </ScrollReveal>
        </SimpleGrid>
      </Box>
    </Box>
  );
}

// ─── E2E + References (stacked, emphasis) ───────────────
function FlagshipFeatures() {
  return (
    <Box pt={{ base: 16, md: 20 }} pb={{ base: 16, md: 24 }} px={6}>
      <Box maxW="1000px" mx="auto">

        {/* E2E */}
        <Flex direction={{ base: "column", md: "row" }} gap={{ base: 6, md: 12 }} justify="center" align="flex-start" mb={{ base: 16, md: 24 }}>
          <ScrollReveal distance={16}>
            <Flex direction="column" gap={3} maxW={{ md: "340px" }} flexShrink={0}>
              <Eyebrow>// end-to-end</Eyebrow>
              <Text as="h3" fontFamily="heading" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" color="fg" letterSpacing="-0.03em" lineHeight="1.1">
                A test suite<br />in a code fence.
              </Text>
              <Text fontSize="sm" color="fg.muted" lineHeight="1.7">
                Chain HTTP calls, extract variables between steps, assert status and JSON shape. When it breaks, you see which step and why — without leaving the doc.
              </Text>
            </Flex>
          </ScrollReveal>

          <ScrollReveal distance={24} delay={120}>
            <Box flex={1} w="full" minW={0}>
              <MockE2eBlock
                alias="auth-flow"
                baseUrl="{{base_url}}"
                steps={[
                  { name: "Login", method: "POST", url: "/api/auth/login"  },
                  { name: "Get Profile", method: "GET", url: "/api/users/me" },
                  { name: "Update Profile", method: "PUT", url: "/api/users/me" },
                ]}
                results={[
                  { name: "Login", method: "POST", url: "/api/auth/login", passed: true, elapsed_ms: 89, status_code: 200, errors: [], extractions: { token: "eyJhbGciOi..." }, response_body: { token: "eyJhbGciOi...", expires_in: 3600 } },
                  { name: "Get Profile", method: "GET", url: "/api/users/me", passed: true, elapsed_ms: 34, status_code: 200, errors: [], extractions: {}, response_body: { id: 1, name: "Alice Johnson" } },
                  { name: "Update Profile", method: "PUT", url: "/api/users/me", passed: true, elapsed_ms: 52, status_code: 200, errors: [], extractions: {}, response_body: { id: 1, name: "Alice Johnson", updated_at: "2026-04-19T10:31:00Z" } },
                ]}
              />
            </Box>
          </ScrollReveal>
        </Flex>

        {/* Block references — killer feature, wider */}
        <Box
          position="relative"
          rounded="xl"
          border="1px solid"
          borderColor="border"
          bg="linear-gradient(180deg, bg.subtle 0%, bg 100%)"
          p={{ base: 6, md: 10 }}
          overflow="hidden"
        >
          {/* Corner accent */}
          <Box position="absolute" top={-1} right={-1} px={3} py={1} bg="brand.400" color="brand.950" fontFamily="mono" fontSize="2xs" fontWeight="700" roundedBottomLeft="md">
            THE KILLER FEATURE
          </Box>

          <Flex direction={{ base: "column", md: "row" }} gap={{ base: 6, md: 12 }} align="flex-start" justify="space-between" mt={{ base: 4, md: 0 }}>
            <ScrollReveal distance={16}>
              <Flex direction="column" gap={3} maxW={{ md: "320px" }} flexShrink={0}>
                <Eyebrow color="brand.400">// composition</Eyebrow>
                <Text as="h3" fontFamily="heading" fontSize={{ base: "2xl", md: "3xl" }} fontWeight="900" color="fg" letterSpacing="-0.03em" lineHeight="1.1">
                  Blocks reference<br />blocks.
                </Text>
                <Text fontSize="sm" color="fg.muted" lineHeight="1.7">
                  Create a user with HTTP. Verify it with SQL using <Text as="code" fontFamily="mono" fontSize="xs" px={1.5} py={0.5} rounded="sm" bg="bg.subtle" border="1px solid" borderColor="border">{`{{create-user.response.id}}`}</Text>. Dependencies execute in the right order, automatically.
                </Text>
                <Flex direction="column" gap={2} mt={2}>
                  <HStack gap={2}><Box w={1} h={1} rounded="full" bg="brand.300" /><Text fontSize="xs" color="fg.muted">DAG by construction — no cycles</Text></HStack>
                  <HStack gap={2}><Box w={1} h={1} rounded="full" bg="brand.300" /><Text fontSize="xs" color="fg.muted">SQL refs become bind params — never interpolated</Text></HStack>
                  <HStack gap={2}><Box w={1} h={1} rounded="full" bg="brand.300" /><Text fontSize="xs" color="fg.muted">Cached results, hash-invalidated</Text></HStack>
                </Flex>
              </Flex>
            </ScrollReveal>

            <ScrollReveal  distance={24} delay={120}>
              <Box flex={1}  w="full" minW={0}>
                <MockReferenceBlock
                  httpAlias="create-user"
                  httpMethod="POST"
                  httpUrl="/api/users"
                  httpResponse={`{ "id": 42, "name": "Alice Johnson" }`}
                  dbAlias="verify-user"
                  dbConnection="Local PostgreSQL"
                  dbQuery={"SELECT * FROM users\nWHERE id = {{create-user.response.id}}"}
                  referenceHighlight="{{create-user.response.id}}"
                  dbColumns={[{ name: "id" }, { name: "name" }, { name: "email" }]}
                  dbRows={[{ id: 42, name: "Alice Johnson", email: "alice@example.com" }]}
                />
              </Box>
            </ScrollReveal>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}

// ─── AI Section ─────────────────────────────────────────
function AISection() {
  return (
    <Box py={{ base: 16, md: 24 }} px={6} id="ai" bg="bg.subtle" borderTop="1px solid" borderBottom="1px solid" borderColor="border">
      <Box maxW="1100px" mx="auto">
        <Flex direction={{ base: "column", md: "row" }} gap={{ base: 10, md: 16 }} justify="space-between" align={{ base: "stretch", md: "center" }}>
          {/* Left — text */}
          <ScrollReveal distance={20} duration={0.5}>
            <Flex direction="column" flex={1} gap={5} maxW="460px">
              <Eyebrow>// ai assistant</Eyebrow>
              <Text as="h3" fontFamily="heading" fontSize={{ base: "2xl", md: "4xl" }} fontWeight="900" color="fg" letterSpacing="-0.03em" lineHeight="1.05">
                Claude edits<br />your docs.<br /><Text as="span" color="fg.muted">You approve the diff.</Text>
              </Text>
              <Text fontSize="sm" color="fg.muted" lineHeight="1.7">
                An agent with MCP tools that read, search, and modify notes — but every write stops at a permission prompt. Nothing touches disk without your explicit OK.
              </Text>

              <Flex direction="column" gap={3} mt={2}>
                <HStack gap={3} align="flex-start">
                  <Box mt={1} color="brand.300"><LuLock size={14} /></Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="600" color="fg">Permission broker</Text>
                    <Text fontSize="xs" color="fg.muted" lineHeight="1.5">Once, session, or always. Bash is always gated.</Text>
                  </Box>
                </HStack>
                <HStack gap={3} align="flex-start">
                  <Box mt={1} color="brand.300"><LuGitBranch size={14} /></Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="600" color="fg">Side-by-side diff</Text>
                    <Text fontSize="xs" color="fg.muted" lineHeight="1.5">Executable blocks render inside the diff. Allow or deny per change.</Text>
                  </Box>
                </HStack>
                <HStack gap={3} align="flex-start">
                  <Box mt={1} color="brand.300"><LuZap size={14} /></Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="600" color="fg">MCP tools built in</Text>
                    <Text fontSize="xs" color="fg.muted" lineHeight="1.5">14 native tools: list, read, write notes, search, run queries.</Text>
                  </Box>
                </HStack>
              </Flex>
            </Flex>
          </ScrollReveal>

          {/* Right — chat panel */}
          <ScrollReveal delay={150} distance={28} duration={0.6}>
            <Box flex={1} maxW={{ base: "100%", md: "440px" }}>
              <MockChatPanel
                messages={[
                  {
                    id: 1, session_id: 1, role: "user", turn_index: 0, tokens_in: null, tokens_out: null, is_partial: false, created_at: Math.floor(Date.now() / 1000),
                    content_json: JSON.stringify([{ type: "text", text: "Add auth headers to all HTTP blocks in this document using the {{auth_token}} variable" }]),
                    tool_calls: [],
                  },
                  {
                    id: 2, session_id: 1, role: "assistant", turn_index: 1, tokens_in: 320, tokens_out: 574, is_partial: false, created_at: Math.floor(Date.now() / 1000),
                    content_json: JSON.stringify([{ type: "text", text: "Found 4 HTTP blocks: `create-user`, `list-users`, `get-user`, and `delete-user`.\n\nAdded `Authorization: Bearer {{auth_token}}` to all 4. The token will resolve from your active environment." }]),
                    tool_calls: [
                      { id: 1, tool_use_id: "t1", tool_name: "mcp__httui_notes__read_note", input_json: JSON.stringify({ path: "user-api.md" }), result_json: "content...", is_error: false, created_at: Math.floor(Date.now() / 1000) },
                      { id: 2, tool_use_id: "t2", tool_name: "mcp__httui_notes__list_notes", input_json: "{}", result_json: "notes...", is_error: false, created_at: Math.floor(Date.now() / 1000) },
                      { id: 3, tool_use_id: "t3", tool_name: "mcp__httui_notes__read_note", input_json: JSON.stringify({ path: "user-api.md" }), result_json: "content...", is_error: false, created_at: Math.floor(Date.now() / 1000) },
                      { id: 4, tool_use_id: "t4", tool_name: "mcp__httui_notes__update_note", input_json: JSON.stringify({ path: "user-api.md", content: "updated" }), result_json: "ok", is_error: false, created_at: Math.floor(Date.now() / 1000) },
                    ],
                  },
                ]}
                permission={{ file: "user-api.md", added: 16, removed: 0 }}
              />
            </Box>
          </ScrollReveal>
        </Flex>
      </Box>
    </Box>
  );
}

// ─── Local-first / philosophy ──────────────────────────
function LocalFirst() {
  const pillars = [
    {
      icon: <LuTerminal size={16} />,
      title: "Plain .md files",
      body: "Everything serializes to standard markdown. Executable blocks live in fenced code blocks. Read it in vim, diff it in git, open it in Obsidian.",
    },
    {
      icon: <LuLock size={16} />,
      title: "Secrets stay put",
      body: "Passwords and secret env vars live in your OS keychain. The SQLite cache only holds a sentinel. Parameterized SQL — zero string interpolation.",
    },
    {
      icon: <LuZap size={16} />,
      title: "Tauri, not Electron",
      body: "~15MB binary. Native performance. Rust backend, React frontend, shared channel for streaming. No bundled Chromium, no runtime slog.",
    },
  ];

  return (
    <Box py={{ base: 16, md: 24 }} px={6} id="local">
      <Box maxW="1100px" mx="auto">
        <ScrollReveal distance={16}>
          <SectionHeading
            eyebrow="// local first"
            title={<>No cloud. No account. <Text as="span" color="fg.muted">No lock-in.</Text></>}
            description="httui runs entirely on your machine. Your notes are files. Your credentials are in the keychain. Your data is yours — there's no sync service we could take down."
            align="center"
            maxW="640px"
          />
        </ScrollReveal>

        <SimpleGrid columns={{ base: 1, md: 3 }} gap={5} mt={14}>
          {pillars.map((p, i) => (
            <ScrollReveal key={p.title} distance={16} delay={i * 80}>
              <Box
                h="full"
                p={6}
                rounded="lg"
                border="1px solid"
                borderColor="border"
                bg="bg.subtle"
                _hover={{ borderColor: "brand.300", bg: "bg.subtle" }}
                transition="border-color 0.2s"
              >
                <Flex align="center" justify="center" w={8} h={8} rounded="md" bg="brand.400/15" color="brand.300" mb={4}>
                  {p.icon}
                </Flex>
                <Text fontFamily="heading" fontSize="md" fontWeight="800" color="fg" mb={2}>{p.title}</Text>
                <Text fontSize="sm" color="fg.muted" lineHeight="1.7">{p.body}</Text>
              </Box>
            </ScrollReveal>
          ))}
        </SimpleGrid>

        {/* stack line */}
        <ScrollReveal distance={12} delay={300}>
          <Flex justify="center" mt={12}>
            <HStack gap={4} fontSize="xs" fontFamily="mono" color="fg.muted" wrap="wrap" justify="center" rowGap={2}>
              <Text>Tauri v2</Text>
              <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
              <Text>Rust</Text>
              <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
              <Text>React</Text>
              <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
              <Text>TipTap</Text>
              <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
              <Text>CodeMirror</Text>
              <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
              <Text>SQLite + FTS5</Text>
              <Box w="2px" h="2px" rounded="full" bg="fg.muted" opacity={0.4} />
              <Text color="brand.300">MIT</Text>
            </HStack>
          </Flex>
        </ScrollReveal>
      </Box>
    </Box>
  );
}

// ─── CTA ────────────────────────────────────────────────
function CTA() {
  return (
    <Box py={{ base: 20, md: 28 }} px={6} position="relative" overflow="hidden" borderTop="1px solid" borderColor="border">
      <Box
        position="absolute"
        bottom="-200px"
        left="50%"
        transform="translateX(-50%)"
        w="800px"
        h="500px"
        bg="radial-gradient(ellipse at center, rgba(236, 154, 56, 0.1), transparent 70%)"
        pointerEvents="none"
        aria-hidden
      />
      <Box maxW="640px" mx="auto" textAlign="center" position="relative">
        <ScrollReveal distance={16}>
          <Eyebrow>// get started</Eyebrow>
        </ScrollReveal>
        <ScrollReveal distance={16} delay={80}>
          <Text as="h2" fontFamily="heading" fontSize={{ base: "3xl", md: "5xl" }} fontWeight="900" color="fg" letterSpacing="-0.035em" lineHeight="1.05" mt={3} mb={4}>
            Stop switching tabs.
          </Text>
        </ScrollReveal>
        <ScrollReveal distance={16} delay={160}>
          <Text fontSize={{ base: "sm", md: "md" }} color="fg.muted" mb={8} lineHeight="1.7" maxW="480px" mx="auto">
            Download it, point at a folder of markdown, type <Text as="code" fontFamily="mono" fontSize="sm" px={1.5} py={0.5} rounded="sm" bg="bg.subtle" border="1px solid" borderColor="border">/http</Text>. That's the onboarding.
          </Text>
        </ScrollReveal>
        <ScrollReveal distance={12} delay={240}>
          <Flex gap={3} wrap="wrap" justify="center">
            <Link href="https://github.com/gandarfh/httui-notes/releases" target="_blank" rel="noopener" display="inline-flex" alignItems="center" gap={2} px={7} py={3.5} rounded="md" bg="brand.400" color="brand.950" fontWeight="700" fontSize="sm" _hover={{ bg: "brand.500", textDecoration: "none", transform: "translateY(-1px)" }} transition="all 0.15s" boxShadow="0 4px 24px rgba(236, 154, 56, 0.3)">
              <LuDownload size={16} /> Download httui
            </Link>
            <Link href="https://github.com/gandarfh/httui-notes" target="_blank" rel="noopener" display="inline-flex" alignItems="center" gap={2} px={7} py={3.5} rounded="md" border="1px solid" borderColor="border" color="fg" fontWeight="600" fontSize="sm" _hover={{ borderColor: "fg.muted", textDecoration: "none", bg: "bg.subtle" }} transition="all 0.15s">
              Read the source
            </Link>
          </Flex>
          <Text fontSize="xs" color="fg.muted" mt={4} fontFamily="mono">macOS · Linux · MIT licensed</Text>
        </ScrollReveal>
      </Box>
    </Box>
  );
}

// ─── Footer ─────────────────────────────────────────────
function Footer() {
  return (
    <Box borderTop="1px solid" borderColor="border" py={8} px={6}>
      <Flex maxW="1200px" mx="auto" justify="space-between" align="center" direction={{ base: "column", md: "row" }} gap={4}>
        <HStack gap={3}>
          <Text fontFamily="heading" fontWeight="900" fontSize="sm" color="fg" letterSpacing="-0.02em">httui</Text>
          <Text fontSize="xs" color="fg.muted">&copy; 2026</Text>
        </HStack>
        <HStack gap={4} fontSize="xs" wrap="wrap" justify="center">
          <Link href="https://github.com/gandarfh/httui-notes" target="_blank" rel="noopener" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }} display="inline-flex" alignItems="center" gap={1}><LuStar size={12} /> Star on GitHub</Link>
          <Link href="https://github.com/gandarfh/httui-notes/releases" target="_blank" rel="noopener" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }}>Releases</Link>
          <Link href="https://github.com/gandarfh/httui-notes/blob/main/docs/ARCHITECTURE.md" target="_blank" rel="noopener" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }}>Docs</Link>
          <Link href="https://github.com/gandarfh/httui-notes/blob/main/LICENSE" target="_blank" rel="noopener" color="fg.muted" _hover={{ color: "brand.300", textDecoration: "none" }}>MIT License</Link>
        </HStack>
      </Flex>
    </Box>
  );
}

// ─── App ────────────────────────────────────────────────
export default function App() {
  return (
    <Box minH="100vh" bg="bg" color="fg">
      <Nav />
      <Hero />
      <ProblemBand />
      <FeaturesGrid />
      <FlagshipFeatures />
      <AISection />
      <LocalFirst />
      <CTA />
      <Footer />
    </Box>
  );
}
