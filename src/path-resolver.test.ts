import { beforeEach, describe, expect, test, vi } from "vitest";
import type { CliConfig } from "./types";

// Mock fs
vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

// Import PathResolver after mocking
import { PathResolver } from "./path-resolver";
import { existsSync } from "fs";

describe("PathResolver", () => {
  let resolver: PathResolver;
  let config: CliConfig;

  beforeEach(() => {
    config = {
      rootDir: "/project",
      aliases: [
        { alias: "@", path: "/project/src" },
        { alias: "~", path: "/project" },
      ],
      fileExtensions: [".vue", ".ts", ".tsx", ".js"],
      respectGitignore: true,
      dryRun: false,
      verbose: false,
    };
    resolver = new PathResolver(config);

    // Reset mock before each test
    vi.mocked(existsSync).mockReset();
  });

  describe("resolveImportPath", () => {
    test("should resolve relative imports", () => {
      // Mock existsSync to return true for our test paths
      vi.mocked(existsSync).mockImplementation((path: string) => {
        const pathStr = path.toString();
        // Normalize the path for cross-platform testing
        const normalizedPath = pathStr.replace(/\\/g, "/");
        return (
          normalizedPath === "/project/src/utils/helper.ts" ||
          normalizedPath === "/project/src/components/Modal.vue"
        );
      });

      const result1 = resolver.resolveImportPath(
        "../utils/helper",
        "/project/src/components/Button.vue"
      );
      const result2 = resolver.resolveImportPath(
        "./Modal.vue",
        "/project/src/components/Button.vue"
      );

      expect(result1).toBe("/project/src/utils/helper.ts");
      expect(result2).toBe("/project/src/components/Modal.vue");
    });

    test("should resolve alias imports", () => {
      // Mock existsSync
      vi.mocked(existsSync).mockImplementation((path: string) => {
        const pathStr = path.toString();
        // Normalize the path for cross-platform testing
        const normalizedPath = pathStr.replace(/\\/g, "/");
        return (
          normalizedPath === "/project/src/utils/helper.ts" ||
          normalizedPath === "/project/stores/main.ts"
        );
      });

      const result1 = resolver.resolveImportPath(
        "@/utils/helper",
        "/project/src/components/Button.vue"
      );
      const result2 = resolver.resolveImportPath(
        "~/stores/main",
        "/project/src/components/Button.vue"
      );

      expect(result1).toBe("/project/src/utils/helper.ts");
      expect(result2).toBe("/project/stores/main.ts");
    });

    test("should handle imports without extensions", () => {
      // Mock existsSync to simulate file discovery
      vi.mocked(existsSync).mockImplementation((path: string) => {
        const pathStr = path.toString();
        // Normalize the path for cross-platform testing
        const normalizedPath = pathStr.replace(/\\/g, "/");
        return normalizedPath === "/project/src/utils/helper.ts"; // .ts file exists
      });

      const result = resolver.resolveImportPath(
        "./helper",
        "/project/src/utils/index.ts"
      );

      expect(result).toBe("/project/src/utils/helper.ts");
    });

    test("should handle index file imports", () => {
      // Mock existsSync to simulate index file
      vi.mocked(existsSync).mockImplementation((path: string) => {
        const pathStr = path.toString();
        // Normalize the path for cross-platform testing
        const normalizedPath = pathStr.replace(/\\/g, "/");
        return normalizedPath === "/project/src/utils/index.ts";
      });

      const result = resolver.resolveImportPath(
        "./utils",
        "/project/src/index.ts"
      );

      expect(result).toBe("/project/src/utils/index.ts");
    });
  });

  describe("calculateNewImportPath", () => {
    test("should update relative imports when importing file moves", () => {
      // Mock resolveImportPath to return known paths
      const originalResolve = resolver.resolveImportPath;
      resolver.resolveImportPath = (importPath: string, _fromFile: string) => {
        if (importPath === "./Component.vue") {
          return "/project/src/components/Component.vue";
        }
        return null;
      };

      const result = resolver.calculateNewImportPath(
        "./Component.vue",
        "/project/src/pages/Home.vue",
        "/project/src/components/Component.vue",
        "/project/src/shared/Component.vue"
      );

      expect(result).toBe("../shared/Component.vue");

      // Restore original method
      resolver.resolveImportPath = originalResolve;
    });

    test("should update imports when the importing file moves", () => {
      // Mock resolveImportPath
      const originalResolve = resolver.resolveImportPath;
      resolver.resolveImportPath = (importPath: string, _fromFile: string) => {
        if (importPath === "./Component.vue") {
          return "/project/src/components/Component.vue";
        }
        return null;
      };

      const result = resolver.calculateNewImportPath(
        "./Component.vue",
        "/project/src/pages/Home.vue",
        "/project/src/pages/Home.vue",
        "/project/src/views/Home.vue",
        "/project/src/views/Home.vue"
      );

      expect(result).toBe("../components/Component.vue");

      // Restore original method
      resolver.resolveImportPath = originalResolve;
    });

    test("should preserve alias imports when possible", () => {
      // Mock resolveImportPath
      const originalResolve = resolver.resolveImportPath;
      resolver.resolveImportPath = (importPath: string, _fromFile: string) => {
        if (importPath === "@/components/Button.vue") {
          return "/project/src/components/Button.vue";
        }
        return null;
      };

      const result = resolver.calculateNewImportPath(
        "@/components/Button.vue",
        "/project/src/pages/Home.vue",
        "/project/src/components/Button.vue",
        "/project/src/shared/Button.vue"
      );

      // Should convert to alias path for the new location
      expect(result).toBe("@/shared/Button.vue");

      // Restore original method
      resolver.resolveImportPath = originalResolve;
    });

    test("should handle directory moves", () => {
      // Mock resolveImportPath
      const originalResolve = resolver.resolveImportPath;
      resolver.resolveImportPath = (importPath: string, _fromFile: string) => {
        if (importPath === "./utils/helper.ts") {
          return "/project/src/components/utils/helper.ts";
        }
        return null;
      };

      const result = resolver.calculateNewImportPath(
        "./utils/helper.ts",
        "/project/src/components/Button.vue",
        "/project/src/components",
        "/project/src/shared"
      );

      expect(result).toBe("../shared/utils/helper.ts");

      // Restore original method
      resolver.resolveImportPath = originalResolve;
    });
  });
});
