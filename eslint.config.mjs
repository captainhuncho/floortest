import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Next.js's recommended rules (Core Web Vitals + TypeScript). The React Compiler advice rules stay visible as
 * warnings: this project doesn't run the compiler, so they're guidance, not bugs. The mobile shell and build output
 * are not linted; Playwright fixtures use a `use` that isn't React's.
 */
const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  { files: ["e2e/**"], rules: { "react-hooks/rules-of-hooks": "off" } },
  { ignores: [".claude/**", ".impeccable/**", ".next/**", "mobile/**", "node_modules/**", "test-results/**", "playwright-report/**", ".e2e/**", "data/**", "next-env.d.ts"] },
];

export default config;
