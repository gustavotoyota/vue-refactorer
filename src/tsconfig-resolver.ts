import { existsSync } from "fs";
import { dirname, resolve, join } from "path";
import { getTsconfig, parseTsconfig, type TsConfigResult } from "get-tsconfig";
import type { PathAliasConfig } from "./types";

/**
 * Normalize path separators to forward slashes for cross-platform compatibility
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * TypeScript configuration information
 */
export interface TsConfigInfo {
  /** Absolute path to the config file */
  configPath: string;
  /** Base URL for resolving paths */
  baseUrl: string;
  /** Raw paths mapping from compilerOptions */
  paths: Record<string, string[]>;
  /** Converted path aliases for internal use */
  aliases: PathAliasConfig[];
  /** Extended configuration path (if any) */
  extends?: string;
  /** Project references (for monorepos) */
  references?: string[];
}

/**
 * Discovers, parses, and caches TypeScript/JavaScript configuration files
 */
export class TsConfigResolver {
  private configCache = new Map<string, TsConfigInfo | null>();
  private fileToConfigCache = new Map<string, string | null>();
  private rootDir: string;
  private verbose: boolean;

  constructor(rootDir: string, verbose: boolean = false) {
    this.rootDir = rootDir;
    this.verbose = verbose;
  }

  /**
   * Find the nearest tsconfig.json or jsconfig.json for a specific file
   */
  findConfigForFile(filePath: string): TsConfigInfo | null {
    const normalizedFilePath = normalizePath(resolve(filePath));

    // Check file-to-config cache
    if (this.fileToConfigCache.has(normalizedFilePath)) {
      const configPath = this.fileToConfigCache.get(normalizedFilePath);
      if (!configPath) return null;
      return this.configCache.get(configPath) || null;
    }

    // Use get-tsconfig to find the nearest tsconfig
    if (this.verbose) {
      console.log(`\nSearching for tsconfig.json starting from: ${dirname(normalizedFilePath)}`);
    }

    // Try tsconfig.json first
    let result = getTsconfig(dirname(normalizedFilePath), "tsconfig.json");

    // Fall back to jsconfig.json if tsconfig.json not found
    if (!result) {
      if (this.verbose) {
        console.log(`  No tsconfig.json found, trying jsconfig.json...`);
      }
      result = getTsconfig(dirname(normalizedFilePath), "jsconfig.json");
    }

    if (!result) {
      if (this.verbose) {
        console.log(`  No tsconfig.json or jsconfig.json found`);
      }
      this.fileToConfigCache.set(normalizedFilePath, null);
      return null;
    }

    const configPath = normalizePath(result.path);
    if (this.verbose) {
      console.log(`  Found config: ${configPath}`);
    }

    // Cache the file-to-config mapping
    this.fileToConfigCache.set(normalizedFilePath, configPath);

    // Check config cache
    if (!this.configCache.has(configPath)) {
      try {
        this.configCache.set(configPath, this.parseConfig(result));
      } catch (error) {
        if (this.verbose) {
          console.warn(
            `Warning: Failed to parse config at ${configPath}: ${error}`
          );
        }
        this.configCache.set(configPath, null);
        return null;
      }
    }

    return this.configCache.get(configPath) || null;
  }

  /**
   * Parse a TypeScript/JavaScript config file using get-tsconfig
   * Accepts either a file path string or a TsConfigResult object
   */
  parseConfig(pathOrResult: string | TsConfigResult): TsConfigInfo {
    let result: TsConfigResult;

    if (typeof pathOrResult === 'string') {
      // Legacy support: parse from file path
      const config = parseTsconfig(pathOrResult);
      result = {
        path: normalizePath(resolve(pathOrResult)),
        config,
      };
    } else {
      result = pathOrResult;
    }

    const configPath = normalizePath(result.path);

    if (this.verbose) {
      console.log(`Parsing config: ${configPath}`);
    }

    // get-tsconfig already resolves extends for us!
    const config = result.config;

    // Extract compiler options
    const compilerOptions = config.compilerOptions || {};
    const baseUrl = compilerOptions.baseUrl || ".";
    const paths = compilerOptions.paths || {};

    // Convert paths to aliases
    let aliases = this.convertPathsToAliases(
      paths,
      baseUrl,
      dirname(configPath)
    );

    // Extract references
    const referencePaths = (config.references || []).map(
      (ref: any) => ref.path as string
    );

    // If we have references but no aliases, try to collect aliases from referenced configs
    // This is common in Nuxt and other frameworks that use project references
    if (referencePaths.length > 0 && aliases.length === 0) {
      if (this.verbose) {
        console.log(`  No aliases in main config, checking ${referencePaths.length} referenced config(s)`);
      }
      aliases = this.collectAliasesFromReferences(referencePaths, configPath);
    }

    const info: TsConfigInfo = {
      configPath,
      baseUrl,
      paths,
      aliases,
    };

    if (referencePaths.length > 0) {
      info.references = referencePaths;
    }

    return info;
  }

  /**
   * Collect path aliases from referenced tsconfig files (for project references)
   */
  private collectAliasesFromReferences(
    references: string[],
    baseConfigPath: string
  ): PathAliasConfig[] {
    const allAliases: PathAliasConfig[] = [];
    const seenAliases = new Set<string>();

    for (const refPath of references) {
      const resolvedRefPath = this.resolveReferencePath(
        refPath,
        dirname(baseConfigPath)
      );

      if (!resolvedRefPath || !existsSync(resolvedRefPath)) {
        if (this.verbose) {
          console.log(`    Referenced config not found: ${refPath}`);
        }
        continue;
      }

      try {
        if (this.verbose) {
          console.log(`    Checking referenced config: ${resolvedRefPath}`);
        }

        // Use parseTsconfig to parse the referenced config
        // Note: parseTsconfig returns the resolved config directly, not a TsConfigResult
        const refConfig = parseTsconfig(resolvedRefPath);

        if (!refConfig) {
          if (this.verbose) {
            console.log(`      Failed to parse referenced config`);
          }
          continue;
        }

        const refCompilerOptions = refConfig.compilerOptions || {};
        const refBaseUrl = refCompilerOptions.baseUrl || ".";
        const refPaths = refCompilerOptions.paths || {};

        if (Object.keys(refPaths).length > 0) {
          if (this.verbose) {
            console.log(`      Found ${Object.keys(refPaths).length} path alias(es)`);
          }

          const refAliases = this.convertPathsToAliases(
            refPaths,
            refBaseUrl,
            dirname(resolvedRefPath)
          );

          // Merge aliases, avoiding duplicates (first occurrence wins)
          for (const alias of refAliases) {
            if (!seenAliases.has(alias.alias)) {
              seenAliases.add(alias.alias);
              allAliases.push(alias);
            }
          }
        }
      } catch (error) {
        if (this.verbose) {
          console.log(`    Failed to parse referenced config ${resolvedRefPath}: ${error}`);
        }
      }
    }

    // Sort by specificity (longer aliases first)
    return allAliases.sort((a, b) => b.alias.length - a.alias.length);
  }

  /**
   * Resolve a reference path (handles relative paths)
   */
  private resolveReferencePath(
    refPath: string,
    fromDir: string
  ): string | null {
    const resolvedPath = resolve(fromDir, refPath);

    // If path has .json extension, use it directly
    if (resolvedPath.endsWith(".json")) {
      return existsSync(resolvedPath) ? normalizePath(resolvedPath) : null;
    }

    // Otherwise, assume it's a tsconfig.json
    const pathWithJson = `${resolvedPath}.json`;
    return existsSync(pathWithJson) ? normalizePath(pathWithJson) : null;
  }

  /**
   * Convert TypeScript paths to internal alias format
   */
  private convertPathsToAliases(
    paths: Record<string, string[]>,
    baseUrl: string,
    configDir: string
  ): PathAliasConfig[] {
    const aliases: PathAliasConfig[] = [];

    for (const [pattern, targets] of Object.entries(paths)) {
      // Remove /* suffix from pattern
      const alias = pattern.replace(/\/\*$/, "");

      // Use first target (TypeScript uses first match)
      const target = targets[0];
      if (!target) continue;

      const targetPath = target.replace(/\/\*$/, "");

      // Resolve relative to baseUrl and config directory
      const absolutePath = normalizePath(
        resolve(configDir, baseUrl, targetPath)
      );

      aliases.push({ alias, path: absolutePath });
    }

    // Sort by specificity (longer aliases first)
    return aliases.sort((a, b) => b.alias.length - a.alias.length);
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCache(): void {
    this.configCache.clear();
    this.fileToConfigCache.clear();
  }

  /**
   * Find all tsconfig files in the workspace (for monorepo support)
   */
  findAllConfigs(rootDir: string = this.rootDir): TsConfigInfo[] {
    const configs: TsConfigInfo[] = [];
    const visited = new Set<string>();

    const searchDir = (dir: string) => {
      if (visited.has(dir)) return;
      visited.add(dir);

      const tsconfigPath = join(dir, "tsconfig.json");
      if (existsSync(tsconfigPath)) {
        try {
          // Use getTsconfig for the main config search to get the full result with path
          const result = getTsconfig(dir, "tsconfig.json");
          if (result) {
            const config = this.parseConfig(result);
            configs.push(config);
          }
        } catch (error) {
          if (this.verbose) {
            console.warn(`Warning: Failed to parse ${tsconfigPath}: ${error}`);
          }
        }
      }

      const jsconfigPath = join(dir, "jsconfig.json");
      if (existsSync(jsconfigPath) && !existsSync(tsconfigPath)) {
        try {
          const result = getTsconfig(dir, "jsconfig.json");
          if (result) {
            const config = this.parseConfig(result);
            configs.push(config);
          }
        } catch (error) {
          if (this.verbose) {
            console.warn(`Warning: Failed to parse ${jsconfigPath}: ${error}`);
          }
        }
      }

      // Don't recurse into node_modules or hidden directories
      try {
        const { readdirSync, statSync } = require("fs");
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (
            entry.isDirectory() &&
            !entry.name.startsWith(".") &&
            entry.name !== "node_modules"
          ) {
            searchDir(join(dir, entry.name));
          }
        }
      } catch {
        // Ignore errors reading directory
      }
    };

    searchDir(rootDir);
    return configs;
  }
}

