/**
 * Welcome screen rendered by AppShell when no vault is active.
 *
 * Lays out the canvas §3 surface: 260px workspace sidebar +
 * centred main column with the three CTAs (open / scaffold /
 * clone-stub). Story 01 functional MVP shipped in `d5917f1`;
 * Story 02 sidebar wired here.
 *
 * Stories 03-07 (card design, templates registry, importar
 * parsers, footer paste-URL handler, post-MVP migration banner)
 * are pending.
 */

import { useCallback, useState } from "react";
import { Box, Flex, Heading, Stack, Text, Button } from "@chakra-ui/react";

import { useWorkspaceStore } from "@/stores/workspace";
import { scaffoldVault } from "@/lib/tauri/commands";
import { EmptyVaultSidebar } from "@/components/layout/empty-vault/EmptyVaultSidebar";

interface CreateState {
  busy: boolean;
  error: string | null;
}

export function EmptyVaultScreen() {
  const openVault = useWorkspaceStore((s) => s.openVault);
  const switchVault = useWorkspaceStore((s) => s.switchVault);
  const [createState, setCreateState] = useState<CreateState>({
    busy: false,
    error: null,
  });
  const handleCreate = useCallback(async () => {
    setCreateState({ busy: true, error: null });
    try {
      const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose folder for new vault",
      });
      if (!selected) {
        setCreateState({ busy: false, error: null });
        return;
      }
      const path = selected as string;
      await scaffoldVault(path);
      await switchVault(path);
    } catch (err) {
      setCreateState({
        busy: false,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    setCreateState({ busy: false, error: null });
  }, [switchVault]);

  return (
    <Flex
      data-testid="empty-vault-screen"
      flex={1}
      bg="bg.subtle"
    >
      <EmptyVaultSidebar onCreateRunbook={handleCreate} />
      <Flex
        flex={1}
        align="center"
        justify="center"
        px={8}
        py={12}
      >
        <Stack maxW="640px" gap={6} align="stretch">
        <Box>
          <Text
            fontSize="xs"
            fontWeight="bold"
            letterSpacing="0.12em"
            textTransform="uppercase"
            color="brand.500"
          >
            Workspace ready
          </Text>
          <Heading as="h1" size="2xl" mt={2}>
            Welcome to httui notes
          </Heading>
          <Text mt={3} fontSize="md" color="fg.muted">
            Each runbook is a `.md` file you read, run, and version. Open
            an existing folder, start fresh, or clone a teammate's vault.
          </Text>
        </Box>

        {createState.error && (
          <Box
            data-testid="empty-vault-error"
            bg="red.50"
            color="red.900"
            border="1px solid"
            borderColor="red.200"
            borderRadius="md"
            px={4}
            py={3}
          >
            <Text fontSize="sm" fontWeight="bold">
              Couldn&apos;t set up the vault
            </Text>
            <Text fontSize="sm" mt={1}>
              {createState.error}
            </Text>
          </Box>
        )}

        <Stack
          direction={{ base: "column", md: "row" }}
          gap={4}
          align="stretch"
        >
          <Stack
            flex={1}
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
            p={4}
            gap={2}
            bg="bg"
          >
            <Heading as="h2" size="md">
              Open
            </Heading>
            <Text fontSize="sm" color="fg.muted">
              Pick an existing folder. httui activates it as a vault if
              it has runbooks, a `connections.toml`, or a `.httui/` marker.
            </Text>
            <Button
              data-testid="empty-vault-open"
              onClick={() => openVault()}
              disabled={createState.busy}
              colorPalette="brand"
              variant="solid"
              mt="auto"
            >
              Choose folder
            </Button>
          </Stack>

          <Stack
            flex={1}
            border="1px solid"
            borderColor="border.subtle"
            borderRadius="md"
            p={4}
            gap={2}
            bg="bg"
          >
            <Heading as="h2" size="md">
              Create
            </Heading>
            <Text fontSize="sm" color="fg.muted">
              Scaffold a fresh vault: `runbooks/`, `connections.toml`,
              `envs/local.toml`, `.httui/`, and a `.gitignore`.
            </Text>
            <Button
              data-testid="empty-vault-create"
              onClick={handleCreate}
              disabled={createState.busy}
              variant="outline"
              mt="auto"
            >
              {createState.busy ? "Working…" : "New vault"}
            </Button>
          </Stack>

        </Stack>

        <Text fontSize="xs" color="fg.muted" textAlign="center">
          Clone-from-git arrives with Epic 17 — for now use{" "}
          <Box as="span" fontFamily="mono">
            git clone &lt;url&gt;
          </Box>{" "}
          in a terminal, then come back and pick the folder above.
        </Text>

        <Text fontSize="xs" color="fg.muted" textAlign="center">
          See{" "}
          <Box as="span" fontFamily="mono">
            docs/getting-started.md
          </Box>{" "}
          for the longer walkthrough.
        </Text>
        </Stack>
      </Flex>
    </Flex>
  );
}
