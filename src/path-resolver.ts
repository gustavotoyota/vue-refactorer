import { existsSync } from "fs";
import { dirname, extname, isAbsolute, relative, resolve } from "path";
import type { CliConfig, PathAliasConfig } from "./types";
import type { TsConfigResolver } from "./tsconfig-resolver";

/**
 * Normalize path separators to forward slashes for cross-platform compatibility
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export class PathResolver {
  private config: CliConfig;
  private tsConfigResolver: TsConfigResolver;
  private aliasCache = new Map<string, PathAliasConfig[]>();

  constructor(config: CliConfig, tsConfigResolver: TsConfigResolver) {
    this.config = config;
    this.tsConfigResolver = tsConfigResolver;
  }

  /**
   * Get aliases for a specific file based on its nearest tsconfig.json
   */
  public getAliasesForFile(filePath: string): PathAliasConfig[] {
    const normalizedPath = normalizePath(resolve(filePath));

    // Check cache
    if (this.aliasCache.has(normalizedPath)) {
      return this.aliasCache.get(normalizedPath)!;
    }

    // Find tsconfig for this file
    const tsConfig = this.tsConfigResolver.findConfigForFile(normalizedPath);

    // Use aliases from tsconfig, or empty array if no config
    const aliases = tsConfig?.aliases || [];

    // Cache for this file
    this.aliasCache.set(normalizedPath, aliases);

    return aliases;
  }

  /**
   * Resolve an import path to an absolute path
   */
  resolveImportPath(importPath: string, fromFile: string): string | null {
    // Handle absolute imports (should be rare in relative projects)
    if (isAbsolute(importPath)) {
      return normalizePath(importPath);
    }

    // Handle alias imports (@ and ~) - now per-file
    const aliasResolved = this.resolveAliasPath(importPath, fromFile);
    if (aliasResolved) {
      return this.findActualFile(normalizePath(aliasResolved));
    }

    // Handle relative imports
    const fromDir = dirname(fromFile);
    const resolvedPath = normalizePath(resolve(fromDir, importPath));
    return this.findActualFile(resolvedPath);
  }

  /**
   * Resolve alias paths like @/components or ~/utils
   * Now context-aware - uses aliases specific to the file
   */
  private resolveAliasPath(importPath: string, fromFile: string): string | null {
    // Get aliases specific to this file
    const aliases = this.getAliasesForFile(fromFile);

    for (const alias of aliases) {
      if (importPath.startsWith(alias.alias + "/")) {
        const relativePath = importPath.substring(alias.alias.length + 1);
        return normalizePath(resolve(alias.path, relativePath));
      } else if (importPath === alias.alias) {
        return normalizePath(alias.path);
      }
    }
    return null;
  }

  /**
   * Find the actual file path, trying different extensions if needed
   */
  private findActualFile(basePath: string): string | null {
    // Normalize the base path for cross-platform compatibility
    const normalizedBasePath = normalizePath(basePath);

    // First, try the exact path
    if (existsSync(normalizedBasePath)) {
      return normalizedBasePath;
    }

    // If no extension, try adding common extensions
    if (!extname(normalizedBasePath)) {
      const extensionsToTry = [".ts", ".tsx", ".js", ".jsx", ".vue"];

      for (const ext of extensionsToTry) {
        const pathWithExt = normalizedBasePath + ext;
        if (existsSync(pathWithExt)) {
          return pathWithExt;
        }
      }

      // Try index files
      const indexExtensions = [
        "/index.ts",
        "/index.tsx",
        "/index.js",
        "/index.jsx",
        "/index.vue",
      ];
      for (const indexExt of indexExtensions) {
        const indexPath = normalizedBasePath + indexExt;
        if (existsSync(indexPath)) {
          return indexPath;
        }
      }
    }

    return null;
  }

  /**
   * Calculate new import path when a file is moved
   */
  calculateNewImportPath(
    originalImportPath: string,
    fromFile: string,
    movedFromPath: string,
    movedToPath: string,
    newFromFile?: string
  ): string | null {
    // Resolve the original import to an absolute path
    const absoluteImportPath = this.resolveImportPath(
      originalImportPath,
      fromFile
    );
    if (!absoluteImportPath) {
      return null;
    }

    // Check if this import points to the moved file/directory
    const isImportingMovedFile = this.isPathAffectedByMove(
      absoluteImportPath,
      movedFromPath,
      movedToPath
    );

    if (!isImportingMovedFile && !newFromFile) {
      // Import doesn't reference moved file and the importing file itself didn't move
      return null;
    }

    // Calculate the new absolute path of the imported file
    let newAbsoluteImportPath = absoluteImportPath;
    if (isImportingMovedFile) {
      newAbsoluteImportPath = this.getNewPathAfterMove(
        absoluteImportPath,
        movedFromPath,
        movedToPath
      );
    }

    // Calculate the new import path relative to the (possibly moved) importing file
    const effectiveFromFile = newFromFile || fromFile;
    const newImportPath = this.calculateRelativeImportPath(
      newAbsoluteImportPath,
      effectiveFromFile,
      originalImportPath
    );

    // If the new path is the same as the original, no update needed
    if (newImportPath === originalImportPath) {
      return null;
    }

    return newImportPath;
  }

  /**
   * Check if a path is affected by a move operation
   */
  private isPathAffectedByMove(
    targetPath: string,
    movedFromPath: string,
    _movedToPath: string
  ): boolean {
    // Normalize paths for cross-platform compatibility
    const normalizedTarget = normalizePath(resolve(targetPath));
    const normalizedFrom = normalizePath(resolve(movedFromPath));

    // Check if the target path is exactly the moved path or is inside the moved directory
    return (
      normalizedTarget === normalizedFrom ||
      normalizedTarget.startsWith(normalizedFrom + "/")
    );
  }

  /**
   * Get the new path after a move operation
   */
  private getNewPathAfterMove(
    originalPath: string,
    movedFromPath: string,
    movedToPath: string
  ): string {
    const normalizedOriginal = normalizePath(resolve(originalPath));
    const normalizedFrom = normalizePath(resolve(movedFromPath));
    const normalizedTo = normalizePath(resolve(movedToPath));

    if (normalizedOriginal === normalizedFrom) {
      // Exact match - the file itself was moved
      return normalizedTo;
    } else if (normalizedOriginal.startsWith(normalizedFrom + "/")) {
      // File is inside the moved directory
      const relativePath = normalizePath(
        relative(normalizedFrom, normalizedOriginal)
      );
      return normalizePath(resolve(normalizedTo, relativePath));
    }

    return normalizedOriginal;
  }

  /**
   * Calculate the appropriate import path (relative, alias, or absolute)
   * Now context-aware - uses aliases specific to the file
   */
  private calculateRelativeImportPath(
    targetPath: string,
    fromFile: string,
    originalImportPath: string
  ): string {
    const fromDir = dirname(fromFile);

    // If original was an alias import, try to maintain the same alias if possible
    if (this.isAliasImport(originalImportPath, fromFile)) {
      const originalAlias = this.getOriginalAlias(originalImportPath, fromFile);
      if (originalAlias) {
        const preferredAliasPath = this.tryConvertToSpecificAliasPath(
          targetPath,
          originalAlias,
          fromFile,
          originalImportPath
        );
        if (preferredAliasPath) {
          return preferredAliasPath;
        }
      }
      // Fallback to any alias if the preferred one doesn't work
      const anyAliasPath = this.tryConvertToAliasPath(
        targetPath,
        fromFile,
        originalImportPath
      );
      if (anyAliasPath) {
        return anyAliasPath;
      }
    }

    // Calculate relative path
    let relativePath = normalizePath(relative(fromDir, targetPath));

    // Handle file extensions: preserve the original extension behavior
    const originalHasExtension = extname(originalImportPath) !== "";
    const targetHasExtension = extname(relativePath) !== "";

    if (!originalHasExtension && targetHasExtension) {
      // Original import had no extension, so remove extension from new path
      const extensionsToRemove = [".ts", ".tsx", ".js", ".jsx"];
      const currentExt = extname(relativePath);
      if (extensionsToRemove.includes(currentExt)) {
        relativePath = relativePath.slice(0, -currentExt.length);
      }
    }

    // Ensure relative paths start with './' or '../'
    if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
      relativePath = "./" + relativePath;
    }

    return relativePath;
  }

  /**
   * Check if an import path uses an alias (context-aware)
   */
  private isAliasImport(importPath: string, fromFile: string): boolean {
    const aliases = this.getAliasesForFile(fromFile);
    return aliases.some(
      (alias) =>
        importPath.startsWith(alias.alias + "/") || importPath === alias.alias
    );
  }

  /**
   * Try to convert an absolute path to an alias path (context-aware)
   */
  private tryConvertToAliasPath(
    absolutePath: string,
    fromFile: string,
    originalImportPath?: string
  ): string | null {
    const aliases = this.getAliasesForFile(fromFile);

    for (const alias of aliases) {
      const aliasAbsolutePath = normalizePath(resolve(alias.path));
      const normalizedAbsolutePath = normalizePath(absolutePath);

      if (normalizedAbsolutePath.startsWith(aliasAbsolutePath + "/")) {
        const relativePath = normalizePath(
          relative(aliasAbsolutePath, normalizedAbsolutePath)
        );
        let aliasPath = alias.alias + "/" + relativePath;

        // Preserve original extension behavior
        if (originalImportPath) {
          aliasPath = this.preserveExtensionBehavior(
            aliasPath,
            originalImportPath
          );
        }

        return aliasPath;
      } else if (normalizedAbsolutePath === aliasAbsolutePath) {
        return alias.alias;
      }
    }
    return null;
  }

  /**
   * Get the original alias used in an import path (context-aware)
   */
  private getOriginalAlias(importPath: string, fromFile: string): string | null {
    const aliases = this.getAliasesForFile(fromFile);

    for (const alias of aliases) {
      if (
        importPath.startsWith(alias.alias + "/") ||
        importPath === alias.alias
      ) {
        return alias.alias;
      }
    }
    return null;
  }

  /**
   * Try to convert an absolute path to a specific alias path (context-aware)
   */
  private tryConvertToSpecificAliasPath(
    absolutePath: string,
    preferredAlias: string,
    fromFile: string,
    originalImportPath?: string
  ): string | null {
    const aliases = this.getAliasesForFile(fromFile);
    const aliasConfig = aliases.find(
      (alias) => alias.alias === preferredAlias
    );
    if (!aliasConfig) {
      return null;
    }

    const aliasAbsolutePath = normalizePath(resolve(aliasConfig.path));
    const normalizedAbsolutePath = normalizePath(absolutePath);

    if (normalizedAbsolutePath.startsWith(aliasAbsolutePath + "/")) {
      const relativePath = normalizePath(
        relative(aliasAbsolutePath, normalizedAbsolutePath)
      );
      let aliasPath = preferredAlias + "/" + relativePath;

      // Preserve original extension behavior
      if (originalImportPath) {
        aliasPath = this.preserveExtensionBehavior(
          aliasPath,
          originalImportPath
        );
      }

      return aliasPath;
    } else if (normalizedAbsolutePath === aliasAbsolutePath) {
      return preferredAlias;
    }

    return null;
  }

  /**
   * Preserve the extension behavior from the original import path
   */
  private preserveExtensionBehavior(
    newPath: string,
    originalImportPath: string
  ): string {
    const originalHasExtension = extname(originalImportPath) !== "";
    const newHasExtension = extname(newPath) !== "";

    if (!originalHasExtension && newHasExtension) {
      // Original import had no extension, so remove extension from new path
      const extensionsToRemove = [".ts", ".tsx", ".js", ".jsx"];
      const currentExt = extname(newPath);
      if (extensionsToRemove.includes(currentExt)) {
        return newPath.slice(0, -currentExt.length);
      }
    }

    return newPath;
  }

  /**
   * Check if two files are the same (accounting for different extensions)
   */
  isSameFile(path1: string, path2: string): boolean {
    const resolved1 = this.findActualFile(path1);
    const resolved2 = this.findActualFile(path2);

    return resolved1 !== null && resolved2 !== null && resolved1 === resolved2;
  }
}
