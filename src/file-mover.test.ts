import { beforeEach, describe, expect, test, vi } from "vitest";
import { FileMover } from "./file-mover";
import { TsConfigResolver } from "./tsconfig-resolver";
import type { CliConfig } from "./types";
import type { TsConfigInfo } from "./tsconfig-resolver";

// Mock dependencies
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
}));
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));
vi.mock("globby", () => ({
  globby: vi.fn(),
}));

describe("FileMover", () => {
  let fileMover: FileMover;
  let config: CliConfig;
  let mockTsConfigResolver: TsConfigResolver;

  beforeEach(() => {
    config = {
      rootDir: "/project",
      fileExtensions: [".vue", ".ts", ".tsx", ".js"],
      respectGitignore: true,
      dryRun: true, // Use dry run for tests
      verbose: false,
    };

    // Create a mock TsConfigResolver
    mockTsConfigResolver = new TsConfigResolver("/project", false);

    // Mock the findConfigForFile method to return our test aliases
    mockTsConfigResolver.findConfigForFile = vi.fn(
      (_filePath: string): TsConfigInfo | null => {
        return {
          configPath: "/project/tsconfig.json",
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
            "~/*": ["./*"],
          },
          aliases: [
            { alias: "@", path: "/project/src" },
            { alias: "~", path: "/project" },
          ],
        };
      }
    );

    fileMover = new FileMover(config, mockTsConfigResolver);

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe("move operation", () => {
    test("should handle moving a single file with imports", async () => {
      const { existsSync } = await import("fs");
      const { readFile } = await import("fs/promises");
      const { globby } = await import("globby");
      const { stat } = await import("fs/promises");

      // Mock file system
      (existsSync as any).mockImplementation((path: any) => {
        const pathStr = path.toString();
        return (
          pathStr === "/project/src/components/Button.vue" ||
          pathStr === "/project/src/pages/Home.vue" ||
          pathStr === "/project/src/utils/helper.ts"
        );
      });

      (stat as any).mockResolvedValue({
        isDirectory: () => false,
      } as any);

      (globby as any).mockResolvedValue([
        "/project/src/pages/Home.vue",
        "/project/src/components/AnotherComponent.vue",
      ]);

      // Mock file contents
      (readFile as any).mockImplementation(async (path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes("Home.vue")) {
          return `
<template>
  <div>
    <Button />
  </div>
</template>

<script setup>
import Button from '@/components/Button.vue';
</script>
`;
        } else if (pathStr.includes("AnotherComponent.vue")) {
          return `
<template>
  <div>Another</div>
</template>

<script setup>
import { helper } from '@/utils/helper';
</script>
`;
        }
        return "";
      });

      // Test moving Button.vue from components to shared
      await fileMover.move(
        "/project/src/components/Button.vue",
        "/project/src/shared/Button.vue"
      );

      // Since it's a dry run, we just verify the process completes without errors
      expect(globby).toHaveBeenCalled();
      expect(readFile).toHaveBeenCalled();
    });

    test("should handle moving a directory", async () => {
      const { existsSync } = await import("fs");
      const { readFile } = await import("fs/promises");
      const { globby } = await import("globby");
      const { stat } = await import("fs/promises");

      (existsSync as any).mockImplementation((path: any) => {
        const pathStr = path.toString();
        return (
          pathStr === "/project/src/components" ||
          pathStr === "/project/src/components/Button.vue" ||
          pathStr === "/project/src/components/Modal.vue" ||
          pathStr === "/project/src/pages/Home.vue"
        );
      });

      (stat as any).mockResolvedValue({
        isDirectory: () => true,
      } as any);

      (globby as any).mockResolvedValue([
        "/project/src/pages/Home.vue",
        "/project/src/layout/Header.vue",
      ]);

      (readFile as any).mockImplementation(async (path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes("Home.vue")) {
          return `
<script setup>
import Button from '@/components/Button.vue';
import Modal from '@/components/Modal.vue';
</script>
`;
        } else if (pathStr.includes("Header.vue")) {
          return `
<script setup>
import { ref } from 'vue';
</script>
`;
        }
        return "";
      });

      await fileMover.move(
        "/project/src/components",
        "/project/src/shared/components"
      );

      expect(globby).toHaveBeenCalled();
    });
  });

  describe("scan operation", () => {
    test("should scan and report all files with imports", async () => {
      const { globby } = await import("globby");
      const { readFile } = await import("fs/promises");
      const { existsSync } = await import("fs");

      (globby as any).mockResolvedValue([
        "/project/src/components/Button.vue",
        "/project/src/pages/Home.vue",
      ]);

      (readFile as any).mockImplementation(async (path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes("Button.vue")) {
          return `
<template>
  <button>Click me</button>
</template>

<script setup>
import { ref } from 'vue';
import { helper } from '@/utils/helper';
</script>
`;
        } else if (pathStr.includes("Home.vue")) {
          return `
<template>
  <div>
    <Button />
  </div>
</template>

<script setup>
import Button from '@/components/Button.vue';
</script>
`;
        }
        return "";
      });

      (existsSync as any).mockReturnValue(true);

      // Capture console output
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => { });

      await fileMover.scan();

      expect(consoleSpy).toHaveBeenCalled();
      expect(globby).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("error handling", () => {
    test("should throw error when source does not exist", async () => {
      const { existsSync } = await import("fs");

      (existsSync as any).mockReturnValue(false);

      await expect(
        fileMover.move("/nonexistent", "/destination")
      ).rejects.toThrow("Source path does not exist: /nonexistent");
    });
  });
});
