import { existsSync, readFileSync } from "fs";
import { dirname, resolve, join } from "path";
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

    // Walk up directory tree to find config
    const configPath = this.walkUpToFindConfig(normalizedFilePath);

    // Cache the file-to-config mapping
    this.fileToConfigCache.set(normalizedFilePath, configPath);

    if (!configPath) return null;

    // Check config cache
    if (!this.configCache.has(configPath)) {
      try {
        this.configCache.set(configPath, this.parseConfig(configPath));
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
   * Walk up the directory tree to find tsconfig.json or jsconfig.json
   */
  private walkUpToFindConfig(filePath: string): string | null {
    let currentDir = dirname(filePath);
    const visited = new Set<string>();

    if (this.verbose) {
      console.log(`\nSearching for tsconfig.json starting from: ${currentDir}`);
    }

    while (currentDir && !visited.has(currentDir)) {
      visited.add(currentDir);

      // Check for tsconfig.json first
      const tsconfigPath = join(currentDir, "tsconfig.json");
      if (this.verbose) {
        console.log(`  Checking: ${tsconfigPath} - ${existsSync(tsconfigPath) ? "Found!" : "Not found"}`);
      }
      if (existsSync(tsconfigPath)) {
        return normalizePath(tsconfigPath);
      }

      // Check for jsconfig.json as fallback
      const jsconfigPath = join(currentDir, "jsconfig.json");
      if (this.verbose) {
        console.log(`  Checking: ${jsconfigPath} - ${existsSync(jsconfigPath) ? "Found!" : "Not found"}`);
      }
      if (existsSync(jsconfigPath)) {
        return normalizePath(jsconfigPath);
      }

      // Stop at git root or filesystem root
      if (existsSync(join(currentDir, ".git"))) {
        if (this.verbose) {
          console.log(`  Found .git directory at ${currentDir}, stopping search`);
        }
        break;
      }

      const parentDir = resolve(currentDir, "..");
      if (parentDir === currentDir) break; // Reached filesystem root
      currentDir = parentDir;
    }

    if (this.verbose) {
      console.log(`  No tsconfig.json or jsconfig.json found`);
    }

    return null;
  }

  /**
   * Parse a TypeScript/JavaScript config file
   */
  parseConfig(configPath: string): TsConfigInfo {
    const normalizedConfigPath = normalizePath(resolve(configPath));

    if (this.verbose) {
      console.log(`Parsing config: ${normalizedConfigPath}`);
    }

    const content = readFileSync(normalizedConfigPath, "utf-8");
    const strippedContent = this.stripJsonComments(content);

    let config: any;
    try {
      config = JSON.parse(strippedContent);
    } catch (error) {
      throw new Error(
        `Failed to parse JSON in ${normalizedConfigPath}: ${error}`
      );
    }

    // Handle extends
    let finalConfig = config;
    const visitedConfigs = new Set<string>([normalizedConfigPath]);

    if (config.extends) {
      finalConfig = this.resolveExtends(
        config,
        normalizedConfigPath,
        visitedConfigs
      );
    }

    // Extract compiler options
    const compilerOptions = finalConfig.compilerOptions || {};
    const baseUrl = compilerOptions.baseUrl || ".";
    const paths = compilerOptions.paths || {};

    // Convert paths to aliases
    let aliases = this.convertPathsToAliases(
      paths,
      baseUrl,
      dirname(normalizedConfigPath)
    );

    // Extract references
    const references = (finalConfig.references || []).map(
      (ref: any) => ref.path
    );

    // If we have references but no aliases, try to collect aliases from referenced configs
    // This is common in Nuxt and other frameworks that use project references
    if (references.length > 0 && aliases.length === 0) {
      if (this.verbose) {
        console.log(`  No aliases in main config, checking ${references.length} referenced config(s)`);
      }
      aliases = this.collectAliasesFromReferences(references, normalizedConfigPath);
    }

    return {
      configPath: normalizedConfigPath,
      baseUrl,
      paths,
      aliases,
      extends: config.extends,
      references: references.length > 0 ? references : undefined,
    };
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
      const resolvedRefPath = this.resolveConfigPath(
        refPath,
        dirname(baseConfigPath)
      );

      if (!resolvedRefPath) {
        if (this.verbose) {
          console.log(`    Referenced config not found: ${refPath}`);
        }
        continue;
      }

      try {
        if (this.verbose) {
          console.log(`    Checking referenced config: ${resolvedRefPath}`);
        }

        const refContent = readFileSync(resolvedRefPath, "utf-8");
        const strippedRefContent = this.stripJsonComments(refContent);
        const refConfig = JSON.parse(strippedRefContent);

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
   * Resolve extended configuration
   */
  private resolveExtends(
    config: any,
    configPath: string,
    visitedConfigs: Set<string>
  ): any {
    const extendsPath = this.resolveConfigPath(
      config.extends,
      dirname(configPath)
    );

    if (!extendsPath) {
      if (this.verbose) {
        console.warn(
          `Warning: Extended config not found: ${config.extends} (from ${configPath})`
        );
      }
      return config;
    }

    // Check for circular extends
    if (visitedConfigs.has(extendsPath)) {
      const cycle = Array.from(visitedConfigs).join(" → ");
      throw new Error(
        `Circular extends detected: ${cycle} → ${extendsPath}`
      );
    }

    visitedConfigs.add(extendsPath);

    // Parse parent config
    const parentContent = readFileSync(extendsPath, "utf-8");
    const strippedParentContent = this.stripJsonComments(parentContent);
    const parentConfig = JSON.parse(strippedParentContent);

    // Recursively resolve parent's extends
    let resolvedParentConfig = parentConfig;
    if (parentConfig.extends) {
      resolvedParentConfig = this.resolveExtends(
        parentConfig,
        extendsPath,
        visitedConfigs
      );
    }

    // Merge configs (child overrides parent)
    return this.mergeConfigs(resolvedParentConfig, config);
  }

  /**
   * Resolve a config path (handles relative and package paths)
   */
  private resolveConfigPath(
    extendsValue: string,
    fromDir: string
  ): string | null {
    // Handle relative paths
    if (extendsValue.startsWith(".")) {
      const resolvedPath = resolve(fromDir, extendsValue);
      // Add .json extension if not present
      const pathWithJson = resolvedPath.endsWith(".json")
        ? resolvedPath
        : `${resolvedPath}.json`;
      return existsSync(pathWithJson)
        ? normalizePath(pathWithJson)
        : existsSync(resolvedPath)
          ? normalizePath(resolvedPath)
          : null;
    }

    // Handle package paths (e.g., "@tsconfig/node18/tsconfig.json")
    // Try to resolve from node_modules
    let currentDir = fromDir;
    const visited = new Set<string>();

    while (currentDir && !visited.has(currentDir)) {
      visited.add(currentDir);
      const nodeModulesPath = join(currentDir, "node_modules", extendsValue);

      if (existsSync(nodeModulesPath)) {
        return normalizePath(nodeModulesPath);
      }

      const parentDir = resolve(currentDir, "..");
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    return null;
  }

  /**
   * Merge two configuration objects (child overrides parent)
   */
  private mergeConfigs(parent: any, child: any): any {
    const merged = { ...parent };

    for (const key in child) {
      if (key === "extends") continue; // Don't merge extends

      if (
        key === "compilerOptions" &&
        typeof child[key] === "object" &&
        typeof parent[key] === "object"
      ) {
        // Deep merge compiler options
        merged[key] = { ...parent[key], ...child[key] };

        // Special handling for paths - child completely overrides parent
        if (child[key].paths) {
          merged[key].paths = child[key].paths;
        }
      } else {
        // Direct override for other properties
        merged[key] = child[key];
      }
    }

    return merged;
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
   * Strip JSON comments (both single-line and multi-line)
   * This is a simple implementation that handles most cases but may not be perfect
   * for all edge cases. It preserves strings by not removing comment-like patterns
   * that appear within quoted strings.
   */
  private stripJsonComments(json: string): string {
    let result = "";
    let inString = false;
    let inSingleLineComment = false;
    let inMultiLineComment = false;
    let stringDelimiter = "";

    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      const nextChar = json[i + 1];
      const prevChar = i > 0 ? json[i - 1] : "";

      // Toggle string state (only if not escaped)
      if ((char === '"' || char === "'") && prevChar !== "\\") {
        if (!inSingleLineComment && !inMultiLineComment) {
          if (!inString) {
            inString = true;
            stringDelimiter = char;
          } else if (char === stringDelimiter) {
            inString = false;
            stringDelimiter = "";
          }
        }
      }

      // Start multi-line comment
      if (
        !inString &&
        !inSingleLineComment &&
        !inMultiLineComment &&
        char === "/" &&
        nextChar === "*"
      ) {
        inMultiLineComment = true;
        i++; // Skip the *
        continue;
      }

      // End multi-line comment
      if (inMultiLineComment && char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        i++; // Skip the /
        continue;
      }

      // Start single-line comment
      if (
        !inString &&
        !inSingleLineComment &&
        !inMultiLineComment &&
        char === "/" &&
        nextChar === "/"
      ) {
        inSingleLineComment = true;
        i++; // Skip the second /
        continue;
      }

      // End single-line comment
      if (inSingleLineComment && (char === "\n" || char === "\r")) {
        inSingleLineComment = false;
        result += char; // Preserve the newline
        continue;
      }

      // Add character if not in a comment
      if (!inSingleLineComment && !inMultiLineComment) {
        result += char;
      }
    }

    return result;
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
          const config = this.parseConfig(tsconfigPath);
          configs.push(config);
        } catch (error) {
          if (this.verbose) {
            console.warn(`Warning: Failed to parse ${tsconfigPath}: ${error}`);
          }
        }
      }

      const jsconfigPath = join(dir, "jsconfig.json");
      if (existsSync(jsconfigPath) && !existsSync(tsconfigPath)) {
        try {
          const config = this.parseConfig(jsconfigPath);
          configs.push(config);
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

