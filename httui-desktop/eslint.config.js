import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "src-tauri", "src/components/ui"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The two stable react-hooks rules stay as errors:
      //   - rules-of-hooks
      //   - exhaustive-deps
      // The remaining rules from the v6 recommended preset are React
      // Compiler diagnostics. Several of them flag intentional patterns
      // in this codebase (refs mutated during render to keep callbacks
      // referentially stable, setState in an effect to derive a clock,
      // etc). Demote to warnings so they stay visible without gating
      // CI; revisit in epic 04 when the compiler config is decided.
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/unsupported-syntax": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
