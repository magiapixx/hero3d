import js from "@eslint/js"
import parserTs from "@typescript-eslint/parser"
import globals from "globals"
import tseslint from "typescript-eslint"

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/node_modules/**", "**/dist/**", "_test/**", "*.config.js"],
  },
  {
    files: ["**/*.{js,ts}"],
    languageOptions: {
      parser: parserTs,
      globals: globals.browser,
    },
    rules: {
      "no-unused-vars": "off",
      // `_`-prefixed params are the convention for required-but-unused signature slots,
      // e.g. the Pass.render(renderer, inputBuffer, ...) overrides.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
]
