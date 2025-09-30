import { beforeEach, describe, expect, test, vi } from "vitest";
import { FileDiscovery } from "./file-discovery";
import type { CliConfig } from "./types";

// Mock fs and globby
vi.mock("fs/promises");
vi.mock("fs");
vi.mock("globby");

describe("FileDiscovery", () => {
  let discovery: FileDiscovery;
  let config: CliConfig;

  beforeEach(() => {
    config = {
      rootDir: "/project",
      fileExtensions: [".vue", ".ts", ".tsx", ".js"],
      respectGitignore: true,
      dryRun: false,
      verbose: false,
    };
    discovery = new FileDiscovery(config);

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe("findAllFiles", () => {
    test("should find files with correct extensions", async () => {
      const { globby } = await import("globby");
      const { readFile } = await import("fs/promises");

      // Mock globby to return test files
      vi.mocked(globby).mockResolvedValue([
        "/project/src/components/Button.vue",
        "/project/src/utils/helper.ts",
        "/project/src/pages/Home.tsx",
      ]);

      // Mock readFile to return test content
      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes("Button.vue")) {
          return '<template><div>Button</div></template>\n<script>\nimport { ref } from "vue";\n</script>';
        } else if (pathStr.includes("helper.ts")) {
          return 'export function helper() { return "hello"; }';
        } else if (pathStr.includes("Home.tsx")) {
          return 'import React from "react";\nexport default function Home() { return <div>Home</div>; }';
        }
        return "";
      });

      const files = await discovery.findAllFiles();

      expect(files).toHaveLength(3);
      expect(files[0]).toMatchObject({
        absolutePath: "/project/src/components/Button.vue",
        relativePath: "src/components/Button.vue",
        extension: ".vue",
      });
      expect(files[1]).toMatchObject({
        absolutePath: "/project/src/utils/helper.ts",
        relativePath: "src/utils/helper.ts",
        extension: ".ts",
      });
      expect(files[2]).toMatchObject({
        absolutePath: "/project/src/pages/Home.tsx",
        relativePath: "src/pages/Home.tsx",
        extension: ".tsx",
      });
    });

    test("should respect .gitignore when configured", async () => {
      const { globby } = await import("globby");
      const { readFile } = await import("fs/promises");
      const { existsSync } = await import("fs");

      // Mock existsSync to simulate .gitignore existence
      vi.mocked(existsSync).mockImplementation((path) => {
        return path.toString() === "/project/.gitignore";
      });

      // Mock readFile for .gitignore
      vi.mocked(readFile).mockImplementation(async (path) => {
        const pathStr = path.toString();
        if (pathStr.includes(".gitignore")) {
          return "node_modules/\n*.log\ndist/";
        }
        return "export default {}";
      });

      // Mock globby to return files
      vi.mocked(globby).mockResolvedValue([
        "/project/src/components/Button.vue",
        "/project/src/utils/helper.ts",
      ]);

      await discovery.findAllFiles();

      expect(vi.mocked(globby)).toHaveBeenCalledWith(
        ["**/*.vue", "**/*.ts", "**/*.tsx", "**/*.js"],
        expect.objectContaining({
          cwd: "/project",
          absolute: true,
          gitignore: true,
        })
      );
    });

    test("should skip .gitignore when not configured", async () => {
      config.respectGitignore = false;
      discovery = new FileDiscovery(config);

      const { globby } = await import("globby");
      const { readFile } = await import("fs/promises");

      vi.mocked(globby).mockResolvedValue([]);
      vi.mocked(readFile).mockResolvedValue("");

      await discovery.findAllFiles();

      expect(vi.mocked(globby)).toHaveBeenCalledWith(
        ["**/*.vue", "**/*.ts", "**/*.tsx", "**/*.js"],
        expect.objectContaining({
          gitignore: false,
        })
      );
    });
  });

  describe("findAffectedFiles", () => {
    test("should find files that might be affected by a move", async () => {
      const { globby } = await import("globby");
      const { readFile } = await import("fs/promises");

      vi.mocked(globby).mockResolvedValue([
        "/project/src/components/Button.vue",
        "/project/src/pages/Home.vue",
      ]);

      vi.mocked(readFile).mockResolvedValue("test content");

      const affectedFiles = await discovery.findAffectedFiles(
        "/project/src/components/Button.vue"
      );

      expect(affectedFiles).toHaveLength(2);
      expect(affectedFiles.map((f) => f.relativePath)).toEqual([
        "src/components/Button.vue",
        "src/pages/Home.vue",
      ]);
    });
  });

  describe("isIgnored", () => {
    test("should return false when no ignore filter is set", () => {
      config.respectGitignore = false;
      discovery = new FileDiscovery(config);

      const result = discovery.isIgnored("/project/node_modules/test.js");
      expect(result).toBe(false);
    });
  });
});
