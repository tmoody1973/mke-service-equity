import {fileURLToPath} from "node:url";

import {defineConfig} from "vitest/config";

const directory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@heroui-pro/react": `${directory}test/heroui-pro-sidebar-mock.tsx`,
      "server-only": `${directory}test/server-only-stub.ts`,
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
