import { existsSync } from "fs";
import { dirname, extname, isAbsolute, relative, resolve } from "path";
import type { CliConfig } from "./types";

export class PathResolver {
  private config: CliConfig;

  constructor(config: CliConfig) {
    this.config = config;
  }

  /**
   * Resolve an import path to an absolute path
   */
  resolveImportPath(importPath: string, fromFile: string): string | null {
    // Handle absolute imports (should be rare in relative projects)
    if (isAbsolute(importPath)) {
      return importPath;
    }

    // Handle alias imports (@ and ~)
    const aliasResolved = this.resolveAliasPath(importPath);
    if (aliasResolved) {
      return this.findActualFile(aliasResolved);
    }

    // Handle relative imports
    const fromDir = dirname(fromFile);
    const resolvedPath = resolve(fromDir, importPath);
    return this.findActualFile(resolvedPath);
  }

  /**
   * Resolve alias paths like @/components or ~/utils
   */
  private resolveAliasPath(importPath: string): string | null {
    for (const alias of this.config.aliases) {
      if (importPath.startsWith(alias.alias + "/")) {
        const relativePath = importPath.substring(alias.alias.length + 1);
        return resolve(alias.path, relativePath);
      } else if (importPath === alias.alias) {
        return alias.path;
      }
    }
    return null;
  }

  /**
   * Find the actual file path, trying different extensions if needed
   */
  private findActualFile(basePath: string): string | null {
    // First, try the exact path
    if (existsSync(basePath)) {
      return basePath;
    }

    // If no extension, try adding common extensions
    if (!extname(basePath)) {
      const extensionsToTry = [".ts", ".tsx", ".js", ".jsx", ".vue"];

      for (const ext of extensionsToTry) {
        const pathWithExt = basePath + ext;
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
        const indexPath = basePath + indexExt;
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
    // Normalize paths
    const normalizedTarget = resolve(targetPath);
    const normalizedFrom = resolve(movedFromPath);

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
    const normalizedOriginal = resolve(originalPath);
    const normalizedFrom = resolve(movedFromPath);
    const normalizedTo = resolve(movedToPath);

    if (normalizedOriginal === normalizedFrom) {
      // Exact match - the file itself was moved
      return normalizedTo;
    } else if (normalizedOriginal.startsWith(normalizedFrom + "/")) {
      // File is inside the moved directory
      const relativePath = relative(normalizedFrom, normalizedOriginal);
      return resolve(normalizedTo, relativePath);
    }

    return normalizedOriginal;
  }

  /**
   * Calculate the appropriate import path (relative, alias, or absolute)
   */
  private calculateRelativeImportPath(
    targetPath: string,
    fromFile: string,
    originalImportPath: string
  ): string {
    const fromDir = dirname(fromFile);

    // If original was an alias import, try to maintain the same alias if possible
    if (this.isAliasImport(originalImportPath)) {
      const originalAlias = this.getOriginalAlias(originalImportPath);
      if (originalAlias) {
        const preferredAliasPath = this.tryConvertToSpecificAliasPath(
          targetPath,
          originalAlias,
          originalImportPath
        );
        if (preferredAliasPath) {
          return preferredAliasPath;
        }
      }
      // Fallback to any alias if the preferred one doesn't work
      const anyAliasPath = this.tryConvertToAliasPath(
        targetPath,
        originalImportPath
      );
      if (anyAliasPath) {
        return anyAliasPath;
      }
    }

    // Calculate relative path
    let relativePath = relative(fromDir, targetPath);

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
   * Check if an import path uses an alias
   */
  private isAliasImport(importPath: string): boolean {
    return this.config.aliases.some(
      (alias) =>
        importPath.startsWith(alias.alias + "/") || importPath === alias.alias
    );
  }

  /**
   * Try to convert an absolute path to an alias path
   */
  private tryConvertToAliasPath(
    absolutePath: string,
    originalImportPath?: string
  ): string | null {
    for (const alias of this.config.aliases) {
      const aliasAbsolutePath = resolve(alias.path);
      if (absolutePath.startsWith(aliasAbsolutePath + "/")) {
        const relativePath = relative(aliasAbsolutePath, absolutePath);
        let aliasPath = alias.alias + "/" + relativePath;

        // Preserve original extension behavior
        if (originalImportPath) {
          aliasPath = this.preserveExtensionBehavior(
            aliasPath,
            originalImportPath
          );
        }

        return aliasPath;
      } else if (absolutePath === aliasAbsolutePath) {
        return alias.alias;
      }
    }
    return null;
  }

  /**
   * Get the original alias used in an import path
   */
  private getOriginalAlias(importPath: string): string | null {
    for (const alias of this.config.aliases) {
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
   * Try to convert an absolute path to a specific alias path
   */
  private tryConvertToSpecificAliasPath(
    absolutePath: string,
    preferredAlias: string,
    originalImportPath?: string
  ): string | null {
    const aliasConfig = this.config.aliases.find(
      (alias) => alias.alias === preferredAlias
    );
    if (!aliasConfig) {
      return null;
    }

    const aliasAbsolutePath = resolve(aliasConfig.path);
    if (absolutePath.startsWith(aliasAbsolutePath + "/")) {
      const relativePath = relative(aliasAbsolutePath, absolutePath);
      let aliasPath = preferredAlias + "/" + relativePath;

      // Preserve original extension behavior
      if (originalImportPath) {
        aliasPath = this.preserveExtensionBehavior(
          aliasPath,
          originalImportPath
        );
      }

      return aliasPath;
    } else if (absolutePath === aliasAbsolutePath) {
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
