import { defineConfig } from "tsup";

export default defineConfig([
  // CLI build with shebang
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    minify: false,
    sourcemap: false,
    target: "node18",
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // Library build without shebang
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: false,
    minify: false,
    sourcemap: false,
    target: "node18",
    splitting: false,
  },
]);
