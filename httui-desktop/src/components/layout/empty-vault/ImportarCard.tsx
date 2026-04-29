// "Importar" card — Epic 41 Story 05 (canvas §3).
//
// White card with orange icon, serif title, body, and pill chips
// for the supported import formats. Pure presentational; consumer
// wires `onSelect` for the file-picker flow.

import { Box, HStack, Stack, Text, chakra } from "@chakra-ui/react";

const CardBox = chakra("button");

export interface ImportarCardProps {
  onSelect: () => void;
}

export const IMPORT_FORMATS: ReadonlyArray<string> = [
  "Postman",
  "Bruno",
  "Insomnia",
  "OpenAPI",
  "HAR",
  ".env",
];

export function ImportarCard({ onSelect }: ImportarCardProps) {
  return (
    <CardBox
      type="button"
      data-atom="importar-card"
      data-testid="importar-card"
      onClick={onSelect}
      aria-label="Importar"
      textAlign="left"
      bg="bg"
      borderWidth="1px"
      borderColor="line"
      borderRadius="12px"
      p="22px"
      minH="260px"
      cursor="pointer"
      _hover={{ borderColor: "fg.3" }}
    >
      <Stack gap={3} h="full">
        <Box
          aria-hidden
          w="32px"
          h="32px"
          borderRadius="6px"
          bg="color-mix(in oklab, oklch(0.62 0.14 50) 14%, transparent)"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          color="oklch(0.62 0.14 50)"
          fontSize="16px"
          data-testid="importar-icon"
        >
          ↘
        </Box>
        <Text
          fontFamily="var(--chakra-fonts-serif)"
          fontSize="18px"
          fontWeight={600}
          color="fg"
          data-testid="importar-title"
        >
          Importar
        </Text>
        <Text fontSize="12px" color="fg.2" lineHeight={1.4}>
          Traga sua coleção. Mantemos pastas, vars e auth.
        </Text>
        <HStack gap={1.5} flexWrap="wrap" mt={1}>
          {IMPORT_FORMATS.map((label) => (
            <Box
              key={label}
              data-testid={`importar-chip-${label.toLowerCase()}`}
              fontSize="10px"
              px="7px"
              py="2px"
              borderRadius="999px"
              bg="bg.2"
              borderWidth="1px"
              borderColor="line"
              fontWeight={500}
              color="fg.2"
            >
              {label}
            </Box>
          ))}
        </HStack>
      </Stack>
    </CardBox>
  );
}
