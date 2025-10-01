import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { globby } from "globby";
import ignore, { type Ignore } from "ignore";
import { extname, join, relative, resolve } from "path";
import type { CliConfig, FileInfo } from "./types";

/**
 * Normalize path separators to forward slashes for cross-platform compatibility
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export class FileDiscovery {
  private config: CliConfig;
  private ignoreFilter?: Ignore;

  constructor(config: CliConfig) {
    this.config = config;
  }

  /**
   * Initialize the ignore filter by reading .gitignore files
   */
  private async initializeIgnoreFilter(): Promise<void> {
    if (!this.config.respectGitignore) {
      return;
    }

    const ig = ignore();

    // Look for .gitignore files starting from root directory and going up
    let currentDir = this.config.rootDir;
    const visited = new Set<string>();

    while (currentDir && !visited.has(currentDir)) {
      visited.add(currentDir);
      const gitignorePath = join(currentDir, ".gitignore");

      if (existsSync(gitignorePath)) {
        try {
          const content = await readFile(gitignorePath, "utf-8");
          ig.add(content);
          if (this.config.verbose) {
            console.log(`Loaded .gitignore from: ${gitignorePath}`);
          }
        } catch {
          if (this.config.verbose) {
            console.warn(
              `Warning: Could not read .gitignore at ${gitignorePath}`
            );
          }
        }
      }

      const parentDir = resolve(currentDir, "..");
      if (parentDir === currentDir) break; // Reached filesystem root
      currentDir = parentDir;
    }

    this.ignoreFilter = ig;
  }

  /**
   * Find all files in the project matching the configured extensions
   */
  async findAllFiles(): Promise<FileInfo[]> {
    await this.initializeIgnoreFilter();

    const patterns = this.config.fileExtensions.map((ext) => `**/*${ext}`);

    // Use workspace root if workspace mode is enabled, otherwise use project root
    const searchRoot = this.config.workspace && this.config.workspaceRoot
      ? this.config.workspaceRoot
      : this.config.rootDir;

    if (this.config.verbose) {
      console.log(`Searching for files with patterns: ${patterns.join(", ")}`);
      if (this.config.workspace && this.config.workspaceRoot) {
        console.log(`Search directory (workspace mode): ${searchRoot}`);
        console.log(`Project root (for configs): ${this.config.rootDir}`);
      } else {
        console.log(`Root directory: ${this.config.rootDir}`);
      }
    }

    const filePaths = await globby(patterns, {
      cwd: searchRoot,
      absolute: true,
      gitignore: this.config.respectGitignore,
    });

    // Additional filtering with our custom ignore if needed
    const filteredPaths = this.ignoreFilter
      ? filePaths.filter((path) => {
        const relativePath = normalizePath(
          relative(searchRoot, path)
        );
        return !this.ignoreFilter!.ignores(relativePath);
      })
      : filePaths;

    if (this.config.verbose) {
      console.log(`Found ${filteredPaths.length} files to process`);
    }

    const fileInfoPromises = filteredPaths.map(
      async (absolutePath): Promise<FileInfo> => {
        const relativePath = normalizePath(
          relative(searchRoot, absolutePath)
        );
        const extension = extname(absolutePath);

        try {
          const content = await readFile(absolutePath, "utf-8");

          return {
            absolutePath,
            relativePath,
            extension,
            content,
            imports: [], // Will be populated later by import parser
          };
        } catch (error) {
          if (this.config.verbose) {
            console.warn(
              `Warning: Could not read file ${absolutePath}: ${error}`
            );
          }
          throw new Error(`Failed to read file: ${absolutePath}`);
        }
      }
    );

    return Promise.all(fileInfoPromises);
  }

  /**
   * Check if a path should be ignored based on .gitignore rules
   */
  isIgnored(filePath: string): boolean {
    if (!this.ignoreFilter) {
      return false;
    }

    const relativePath = normalizePath(relative(this.config.rootDir, filePath));
    return this.ignoreFilter.ignores(relativePath);
  }

  /**
   * Find files that might be affected by moving a specific file or directory
   */
  async findAffectedFiles(movePath: string): Promise<FileInfo[]> {
    const allFiles = await this.findAllFiles();
    const movePathRelative = normalizePath(
      relative(this.config.rootDir, movePath)
    );

    if (this.config.verbose) {
      console.log(`Looking for files affected by moving: ${movePathRelative}`);
    }

    // For now, return all files since any file could potentially import the moved file
    // In a more optimized version, we could pre-analyze imports to narrow this down
    return allFiles;
  }
}
