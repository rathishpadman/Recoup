import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "node_modules/**",
      ".claude/**",
      ".next/**",
      "**/.next/**",
      "design-system/**",
      "mockups/**",
      "output/**",
      "*.config.js",
      "*.config.cjs",
      "*.config.mjs",
      "dependency-cruiser.config.cjs"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error"
    }
  }
];
