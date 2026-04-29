// httui logo + wordmark + 1×18 vertical divider — canvas §4.

import { Box, HStack, Text } from "@chakra-ui/react";

export function Brand() {
  return (
    <HStack data-atom="brand" gap={2}>
      <Box
        aria-hidden
        w="18px"
        h="18px"
        borderRadius="4px"
        bg="accent"
        display="inline-flex"
        alignItems="center"
        justifyContent="center"
        color="accent.fg"
        fontSize="11px"
        fontWeight={700}
      >
        h
      </Box>
      <Text
        as="span"
        fontFamily="body"
        fontSize="13px"
        fontWeight={700}
        color="accent"
        letterSpacing="-0.02em"
      >
        httui
      </Text>
      <Box
        aria-hidden
        h="18px"
        w="1px"
        bg="line"
        ml={2}
        flexShrink={0}
      />
    </HStack>
  );
}
