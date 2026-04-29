import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Mirrors httui-desktop's eslint.config.js intentionally so contributors
// see one Rust-style linter setup and one frontend linter setup, period.
// React Compiler-driven rules (refs / set-state-in-effect / purity / etc.)
// stay as warnings here too — same rationale as the desktop config.
export default tseslint.config(
  { ignores: ["dist"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

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

      // SOLID nudges at function granularity — see httui-desktop/
      // eslint.config.js for the rationale + threshold reasoning.
      // Mirrored here so the two frontend codebases share the same gate.
      complexity: ["warn", 15],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      "max-params": ["warn", 5],
      "max-depth": ["warn", 4],
    },
  },
  {
    files: [
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/test/**",
    ],
    rules: {
      "max-lines-per-function": "off",
      complexity: "off",
      "max-depth": "off",
      "max-params": "off",
    },
  },
);
