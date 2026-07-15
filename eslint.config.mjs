import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignore: generated Next.js files are not source we lint or edit.
  // `next-env.d.ts` is auto-generated (and self-labeled "should not be edited"),
  // so its triple-slash references are not our code to fix.
  { ignores: [".next/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Node-runner test files use explicit `.ts` import specifiers (required by the
  // built-in test runner). They are type-checked separately via
  // `tsconfig.tests.json` (npm run test:typecheck); relax the extension rule
  // here so they are still linted for everything else.
  {
    files: ["**/__tests__/**/*.ts"],
    rules: {
      "import/extensions": "off",
    },
  },
];

export default eslintConfig;
