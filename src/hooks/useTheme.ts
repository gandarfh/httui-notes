import { useColorMode } from "@/components/ui/color-mode";

export function useTheme() {
  const { colorMode, toggleColorMode } = useColorMode();

  return {
    theme: colorMode as "light" | "dark",
    toggleTheme: toggleColorMode,
  };
}
