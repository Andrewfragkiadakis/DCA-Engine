import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**"] },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Only the two classic, well-understood hooks rules — not the full "recommended"
      // bundle, which in this plugin version also pulls in React Compiler diagnostics
      // (set-state-in-effect, preserve-manual-memoization, etc.) that flag standard,
      // correct React 18 patterns used throughout this codebase as errors.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  {
    files: ["**/*.test.js"],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    files: ["api/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  {
    files: ["middleware.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      // Vercel Edge Middleware: Web-platform globals plus a polyfilled `process.env`.
      globals: { ...globals.browser, ...globals.serviceworker, process: "readonly" },
    },
  },

  {
    files: ["vite.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
