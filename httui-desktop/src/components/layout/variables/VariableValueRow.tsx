// Canvas §6 Variables — detail panel value row (Epic 43 Story 02 slice 1).
//
// One row per env. Read-only this slice: shows the value (or em-dash
// for undefined / `••••••••` mask for secret-not-revealed) plus a
// `Show` / `Hide` toggle when the variable is a secret. Edit + Save
// land in the next slice. The consumer plugs `fetchSecret` to resolve
// the cleartext from the keychain on demand — undefined disables the
// toggle.

import { Box, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";

import { Btn } from "@/components/atoms";

const SECRET_MASK = "••••••••";

export interface VariableValueRowProps {
  env: string;
  /** Ground-truth value from `row.values[env]`. Undefined → em-dash. */
  value: string | undefined;
  isSecret: boolean;
  /** Async cleartext fetch (keychain). Returning undefined renders an empty cleartext. */
  fetchSecret?: (env: string) => Promise<string | undefined>;
}

type RevealState =
  | { kind: "masked" }
  | { kind: "loading" }
  | { kind: "revealed"; value: string }
  | { kind: "error"; message: string };

export function VariableValueRow({
  env,
  value,
  isSecret,
  fetchSecret,
}: VariableValueRowProps) {
  const [reveal, setReveal] = useState<RevealState>({ kind: "masked" });

  async function handleShow() {
    if (!fetchSecret) return;
    setReveal({ kind: "loading" });
    try {
      const v = await fetchSecret(env);
      setReveal({ kind: "revealed", value: v ?? "" });
    } catch (e) {
      setReveal({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function handleHide() {
    setReveal({ kind: "masked" });
  }

  return (
    <Flex
      data-testid={`variable-value-row-${env}`}
      align="center"
      gap={2}
      px={4}
      py={2}
      borderBottomWidth="1px"
      borderBottomColor="line"
    >
      <Text
        as="span"
        fontFamily="mono"
        fontSize="11px"
        color="fg.2"
        w="68px"
        flexShrink={0}
        truncate
        data-testid={`variable-value-row-${env}-env-label`}
      >
        {env}
      </Text>
      <Box flex={1} minW={0}>
        <ValueDisplay
          env={env}
          value={value}
          isSecret={isSecret}
          reveal={reveal}
        />
      </Box>
      {isSecret && (
        <SecretToggle
          env={env}
          reveal={reveal}
          enabled={!!fetchSecret}
          onShow={handleShow}
          onHide={handleHide}
        />
      )}
    </Flex>
  );
}

function ValueDisplay({
  env,
  value,
  isSecret,
  reveal,
}: {
  env: string;
  value: string | undefined;
  isSecret: boolean;
  reveal: RevealState;
}) {
  const testId = `variable-value-row-${env}-display`;

  if (reveal.kind === "loading") {
    return (
      <Text fontFamily="mono" fontSize="11px" color="fg.3" data-testid={testId}>
        carregando…
      </Text>
    );
  }
  if (reveal.kind === "error") {
    return (
      <Text
        fontFamily="mono"
        fontSize="11px"
        color="error"
        data-testid={testId}
        title={reveal.message}
      >
        ⚠ {reveal.message}
      </Text>
    );
  }
  if (isSecret && reveal.kind !== "revealed") {
    return (
      <Text fontFamily="mono" fontSize="11px" color="fg.2" data-testid={testId}>
        {SECRET_MASK}
      </Text>
    );
  }
  if (isSecret && reveal.kind === "revealed") {
    return (
      <Text
        fontFamily="mono"
        fontSize="11px"
        color="fg"
        title={reveal.value}
        truncate
        data-testid={testId}
      >
        {reveal.value || (
          <Text as="span" color="fg.3">
            {"(vazio)"}
          </Text>
        )}
      </Text>
    );
  }
  if (value === undefined) {
    return (
      <Text fontFamily="mono" fontSize="11px" color="fg.3" data-testid={testId}>
        —
      </Text>
    );
  }
  return (
    <Text
      fontFamily="mono"
      fontSize="11px"
      color="fg"
      title={value}
      truncate
      data-testid={testId}
    >
      {value}
    </Text>
  );
}

function SecretToggle({
  env,
  reveal,
  enabled,
  onShow,
  onHide,
}: {
  env: string;
  reveal: RevealState;
  enabled: boolean;
  onShow: () => void;
  onHide: () => void;
}) {
  if (reveal.kind === "revealed") {
    return (
      <Btn
        variant="ghost"
        data-testid={`variable-value-row-${env}-hide`}
        onClick={onHide}
      >
        Hide
      </Btn>
    );
  }
  return (
    <Btn
      variant="ghost"
      data-testid={`variable-value-row-${env}-show`}
      onClick={onShow}
      disabled={!enabled || reveal.kind === "loading"}
    >
      {reveal.kind === "loading" ? "…" : "Show"}
    </Btn>
  );
}
