import { useState, useCallback, useRef } from "react";
import {
  Button,
  CloseButton,
  Dialog,
  Field,
  Input,
  Portal,
  Stack,
} from "@chakra-ui/react";

interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

export function usePromptDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PromptOptions>({
    title: "",
  });
  const [value, setValue] = useState("");
  const resolveRef = useRef<((val: string | null) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback(
    (opts: PromptOptions): Promise<string | null> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setOptions(opts);
        setValue(opts.defaultValue ?? "");
        setOpen(true);
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      resolveRef.current?.(trimmed);
    } else {
      resolveRef.current?.(null);
    }
    setOpen(false);
  }, [value]);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(null);
    setOpen(false);
  }, []);

  const PromptDialog = (
    <Dialog.Root
      lazyMount
      open={open}
      onOpenChange={(e) => {
        if (!e.open) handleCancel();
      }}
      initialFocusEl={() => inputRef.current}
      size="sm"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{options.title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap={4}>
                <Field.Root>
                  {options.label && (
                    <Field.Label>{options.label}</Field.Label>
                  )}
                  <Input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={options.placeholder}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleConfirm();
                      }
                    }}
                  />
                </Field.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button onClick={handleConfirm}>
                {options.confirmLabel ?? "Confirmar"}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );

  return { prompt, PromptDialog };
}
