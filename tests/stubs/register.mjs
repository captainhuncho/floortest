// Loaded before every unit test (package.json "test"). Server code that reads a page's props (lib/terms-record.ts reads
// the Terms page) imports next/link, which needs the client React build that tests don't load; a placeholder stands in.
import { registerHooks } from "node:module";

const linkStub = new URL("./next-link.mjs", import.meta.url).href;
registerHooks({ resolve: (specifier, context, next) => (specifier === "next/link" ? { url: linkStub, shortCircuit: true } : next(specifier, context)) });
