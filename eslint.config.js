import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

export default [
  {
    // Global ignores
    ignores: [
      "dist/**",
      "coverage/**",
      "docs/**",
      "node_modules/**",
      "*.config.js",
      "*.config.ts",
      "webpack.config.js",
      "jest.config.js",
    ],
  },
  {
    // Base configuration for all files
    files: ["**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
      },
    },
    rules: {
      // Basic ESLint recommended rules
      "no-unused-vars": "off", // Disabled in favor of TypeScript version
      "no-console": "warn",
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "no-unused-expressions": "error",
    },
  },
  {
    // TypeScript specific configuration
    files: ["**/*.ts"],
    plugins: {
      "@typescript-eslint": typescriptEslint,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: "module",
        project: "./tsconfig.json",
      },
    },
    rules: {
      // Custom TypeScript rules
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-inferrable-types": "off",
      "prefer-const": "error",
    },
  },
  {
    // Test files configuration
    files: ["**/*.test.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        test: "readonly",
        jest: "readonly",
      },
    },
    rules: {
      // Relax some rules for test files
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  {
    // CLI and scripts configuration
    files: ["bin/**/*.js", "scripts/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "no-console": "off", // Allow console in CLI scripts
    },
  },
  {
    // Demo and example files
    files: ["demo/**/*.js", "examples/**/*.js"],
    rules: {
      "no-console": "off", // Allow console in demo files
    },
  },
];
