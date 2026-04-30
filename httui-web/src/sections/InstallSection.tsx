import { Box, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { Eyebrow } from "../components/atoms";

function InstallTerminal() {
  return (
    <Box
      maxW="760px"
      mx="auto"
      mb={7}
      rounded="xl"
      overflow="hidden"
      border="1px solid"
      borderColor="stone.500"
      bg="stone.900"
      color="paper.100"
      fontFamily="mono"
      shadow="photo"
    >
      <HStack
        px={3.5}
        py={2.5}
        gap={2}
        borderBottom="1px solid"
        borderColor="stone.500"
      >
        <Box w="10px" h="10px" rounded="full" bg="#ed6a5e" />
        <Box w="10px" h="10px" rounded="full" bg="#f4be4f" />
        <Box w="10px" h="10px" rounded="full" bg="#62c554" />
        <Text flex="1" textAlign="center" fontSize="11px" color="stone.200">
          ~/projects · zsh
        </Text>
        <Text
          fontSize="10px"
          color="moss.300"
          px={2}
          py={0.5}
          border="1px solid"
          borderColor="moss.700"
          rounded="sm"
          fontWeight="600"
        >
          COPY
        </Text>
      </HStack>
      <Box px={5} py={5} fontSize="14px" lineHeight="1.8">
        <Text>
          <Text as="span" color="moss.300">
            $
          </Text>{" "}
          curl -fsSL httui.sh/install | sh
        </Text>
        <Text color="stone.200" fontSize="13px">
          ✓ httui 0.8.2 installed in ~/.httui/bin
        </Text>
        <Text color="stone.200" fontSize="13px">
          ✓ shell: zsh detected, alias 'httui' added
        </Text>
        <Text>
          <Text as="span" color="moss.300">
            $
          </Text>{" "}
          httui new my-runbook.md
        </Text>
      </Box>
    </Box>
  );
}

// InstallSection — single primary terminal block + 4
// alt-installs. OSS-style minimal.
export function InstallSection() {
  const distros = [
    { label: "Homebrew", code: "brew install httui", icon: "" },
    { label: "apt / dnf", code: "apt install httui", icon: "" },
    { label: "winget", code: "winget install httui", icon: "▣" },
    { label: "From source", code: "go install httui/cmd/httui", icon: "{ }" },
  ];
  return (
    <Box
      as="section"
      id="install"
      px={{ base: 6, md: 20 }}
      py={{ base: 16, md: 24 }}
      bg="bg.surface"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="border"
    >
      <VStack gap={3.5} mb={10} textAlign="center">
        <Eyebrow>Install</Eyebrow>
        <Text
          as="h2"
          fontFamily="heading"
          fontWeight="600"
          fontSize={{ base: "36px", md: "52px" }}
          lineHeight="1.1"
          letterSpacing="tight"
          color="fg"
        >
          Free forever.{" "}
          <Text as="em" color="accent" fontStyle="italic">
            Yours
          </Text>{" "}
          to fork.
        </Text>
        <Text
          fontFamily="heading"
          fontSize="17px"
          color="fg.muted"
          maxW="580px"
        >
          One terminal command. No signup, no card, no telemetry.
        </Text>
      </VStack>

      <InstallTerminal />

      {/* Alt installs */}
      <SimpleGrid maxW="920px" mx="auto" columns={{ base: 2, md: 4 }} gap={2.5}>
        {distros.map((p) => (
          <Box
            key={p.label}
            p={3.5}
            bg="bg"
            border="1px solid"
            borderColor="border"
            rounded="md"
          >
            <HStack gap={2} mb={1.5} fontSize="11px" color="fg.subtle">
              <Text fontFamily="mono">{p.icon}</Text>
              <Text fontWeight="600" color="fg.muted">
                {p.label}
              </Text>
            </HStack>
            <Text fontFamily="mono" fontSize="11.5px" color="fg" truncate>
              {p.code}
            </Text>
          </Box>
        ))}
      </SimpleGrid>

      <Text
        textAlign="center"
        mt={7}
        fontSize="xs"
        color="fg.muted"
        maxW="700px"
        mx="auto"
        lineHeight="1.7"
      >
        Prefer a GUI? Builds for{" "}
        <Text as="span" fontFamily="mono" color="fg.muted">
          macOS
        </Text>{" "}
        ·{" "}
        <Text as="span" fontFamily="mono" color="fg.muted">
          Linux
        </Text>{" "}
        ·{" "}
        <Text as="span" fontFamily="mono" color="fg.muted">
          Windows
        </Text>{" "}
        on the{" "}
        <Text as="span" color="accent.emphasized" fontWeight="600">
          GitHub releases
        </Text>
        . A VS Code extension is also available.
      </Text>
    </Box>
  );
}
