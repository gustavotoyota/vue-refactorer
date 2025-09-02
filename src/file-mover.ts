import { existsSync } from "fs";
import { mkdir, readdir, rename, rmdir, stat, writeFile } from "fs/promises";
import { globby } from "globby";
import { basename, dirname, join, relative, resolve } from "path";
import { FileDiscovery } from "./file-discovery";
import { ImportParser } from "./import-parser";
import { PathResolver } from "./path-resolver";
import type { CliConfig, FileInfo, ImportInfo, UpdateResult } from "./types";

/**
 * Normalize path separators to forward slashes for cross-platform compatibility
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export class FileMover {
  private config: CliConfig;
  private fileDiscovery: FileDiscovery;
  private importParser: ImportParser;
  private pathResolver: PathResolver;

  constructor(config: CliConfig) {
    this.config = config;
    this.fileDiscovery = new FileDiscovery(config);
    this.importParser = new ImportParser();
    this.pathResolver = new PathResolver(config);
  }

  /**
   * Move a file or directory and update all import references
   */
  async move(
    sourcePath: string,
    destinationPath: string,
    useGlobPattern: boolean = false
  ): Promise<void> {
    // Handle glob pattern moves
    if (useGlobPattern) {
      return await this.moveGlobPattern(sourcePath, destinationPath);
    }

    if (!existsSync(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }

    const sourceStats = await stat(sourcePath);
    const isSourceDirectory = sourceStats.isDirectory();

    // Apply the rule: destination is folder unless source is specific file without wildcards
    let finalDestinationPath = destinationPath;

    // If destination exists and is a directory, move the source into that directory
    if (existsSync(destinationPath)) {
      const destStats = await stat(destinationPath);
      if (destStats.isDirectory()) {
        const sourceFilename = basename(sourcePath);
        finalDestinationPath = resolve(destinationPath, sourceFilename);
      }
    }
    // If destination doesn't exist but looks like a directory (ends with /),
    // or its parent exists and is a directory, treat as folder
    else if (
      destinationPath.endsWith("/") ||
      (existsSync(dirname(destinationPath)) &&
        (await stat(dirname(destinationPath))).isDirectory() &&
        !destinationPath.includes("."))
    ) {
      const sourceFilename = basename(sourcePath);
      finalDestinationPath = resolve(destinationPath, sourceFilename);
    }

    if (this.config.verbose) {
      console.log(
        `${this.config.dryRun ? "Would move" : "Moving"} ${
          isSourceDirectory ? "directory" : "file"
        }:`
      );
      console.log(`  From: ${sourcePath}`);
      console.log(`  To: ${finalDestinationPath}`);
      console.log();
    }

    // Find all files that might be affected
    const allFiles = await this.fileDiscovery.findAllFiles();

    // Parse imports for all files
    const filesWithImports = await this.parseImportsForFiles(allFiles);

    // Find files that need to be updated
    const filesToUpdate = await this.findFilesToUpdate(
      filesWithImports,
      sourcePath,
      finalDestinationPath
    );

    if (this.config.verbose) {
      console.log(
        `Found ${filesToUpdate.length} files with imports that need updating`
      );
    }

    // Update import references
    const updateResults = await this.updateImportReferences(
      filesToUpdate,
      sourcePath,
      finalDestinationPath,
      isSourceDirectory
    );

    // Actually move the file/directory (unless dry run)
    if (!this.config.dryRun) {
      await this.performMove(sourcePath, finalDestinationPath);
    }

    // Report results
    this.reportResults(
      updateResults,
      sourcePath,
      finalDestinationPath,
      isSourceDirectory
    );
  }

  /**
   * Scan directory and show all files and their imports (for debugging)
   */
  async scan(): Promise<void> {
    console.log("Scanning directory for files and imports...\n");

    const allFiles = await this.fileDiscovery.findAllFiles();
    const filesWithImports = await this.parseImportsForFiles(allFiles);

    for (const file of filesWithImports) {
      if (file.imports.length > 0) {
        console.log(`📁 ${file.relativePath}`);
        for (const imp of file.imports) {
          const resolvedPath = this.pathResolver.resolveImportPath(
            imp.path,
            file.absolutePath
          );
          const status = resolvedPath && existsSync(resolvedPath) ? "✅" : "❌";
          console.log(`  ${status} Line ${imp.line}: ${imp.original.trim()}`);
          if (resolvedPath && this.config.verbose) {
            console.log(
              `      Resolves to: ${normalizePath(
                relative(this.config.rootDir, resolvedPath)
              )}`
            );
          }
        }
        console.log();
      }
    }
  }

  /**
   * Parse imports for all files
   */
  private async parseImportsForFiles(files: FileInfo[]): Promise<FileInfo[]> {
    return files.map((file) => ({
      ...file,
      imports: this.importParser.parseImports(file),
    }));
  }

  /**
   * Find files that need import updates
   */
  private async findFilesToUpdate(
    files: FileInfo[],
    sourcePath: string,
    destinationPath: string
  ): Promise<FileInfo[]> {
    const filesToUpdate: FileInfo[] = [];

    for (const file of files) {
      const needsUpdate = await this.fileNeedsUpdate(
        file,
        sourcePath,
        destinationPath
      );
      if (needsUpdate) {
        filesToUpdate.push(file);
      }
    }

    return filesToUpdate;
  }

  /**
   * Check if a file needs import updates
   */
  private async fileNeedsUpdate(
    file: FileInfo,
    sourcePath: string,
    destinationPath: string
  ): Promise<boolean> {
    // Check if the file itself is being moved
    const isFileMoved = this.isPathAffectedByMove(
      file.absolutePath,
      sourcePath,
      destinationPath
    );

    // Check if any of its imports reference the moved file/directory
    const hasAffectedImports = file.imports.some((imp) => {
      const resolvedPath = this.pathResolver.resolveImportPath(
        imp.path,
        file.absolutePath
      );
      return (
        resolvedPath &&
        this.isPathAffectedByMove(resolvedPath, sourcePath, destinationPath)
      );
    });

    return isFileMoved || hasAffectedImports;
  }

  /**
   * Check if a path is affected by the move operation
   */
  private isPathAffectedByMove(
    targetPath: string,
    sourcePath: string,
    _destinationPath: string
  ): boolean {
    const normalizedTarget = resolve(targetPath);
    const normalizedSource = resolve(sourcePath);

    return (
      normalizedTarget === normalizedSource ||
      normalizedTarget.startsWith(normalizedSource + "/")
    );
  }

  /**
   * Update import references in files
   */
  private async updateImportReferences(
    files: FileInfo[],
    sourcePath: string,
    destinationPath: string,
    isDirectory: boolean
  ): Promise<UpdateResult[]> {
    const results: UpdateResult[] = [];

    for (const file of files) {
      const result = await this.updateFileImports(
        file,
        sourcePath,
        destinationPath
      );
      if (result.updatedImports > 0) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Update imports in a single file
   */
  private async updateFileImports(
    file: FileInfo,
    sourcePath: string,
    destinationPath: string
  ): Promise<UpdateResult> {
    const updates: Array<{ from: ImportInfo; to: string }> = [];
    const changes: Array<{ line: number; from: string; to: string }> = [];

    // Check if the file itself is being moved
    const isFileMoved = this.isPathAffectedByMove(
      file.absolutePath,
      sourcePath,
      destinationPath
    );
    const newFilePath = isFileMoved
      ? this.getNewPathAfterMove(file.absolutePath, sourcePath, destinationPath)
      : file.absolutePath;

    // Process each import
    for (const imp of file.imports) {
      const newImportPath = this.pathResolver.calculateNewImportPath(
        imp.path,
        file.absolutePath,
        sourcePath,
        destinationPath,
        isFileMoved ? newFilePath : undefined
      );

      if (newImportPath && newImportPath !== imp.path) {
        updates.push({ from: imp, to: newImportPath });
        changes.push({
          line: imp.line,
          from: imp.path,
          to: newImportPath,
        });
      }
    }

    // Apply updates to file content
    let updatedContent = file.content;
    if (updates.length > 0) {
      updatedContent = this.importParser.updateImportsInContent(
        file.content,
        updates
      );

      // Write updated content (unless dry run)
      if (!this.config.dryRun) {
        // Always write to the current file location first
        // The actual file move will happen later and move this updated content
        await writeFile(file.absolutePath, updatedContent, "utf-8");
      }
    }

    return {
      filePath: isFileMoved ? newFilePath : file.absolutePath,
      updatedImports: updates.length,
      changes,
    };
  }

  /**
   * Get the new path after a move operation
   */
  private getNewPathAfterMove(
    originalPath: string,
    sourcePath: string,
    destinationPath: string
  ): string {
    const normalizedOriginal = resolve(originalPath);
    const normalizedSource = resolve(sourcePath);
    const normalizedDestination = resolve(destinationPath);

    if (normalizedOriginal === normalizedSource) {
      return normalizedDestination;
    } else if (normalizedOriginal.startsWith(normalizedSource + "/")) {
      const relativePath = normalizePath(
        relative(normalizedSource, normalizedOriginal)
      );
      return resolve(normalizedDestination, relativePath);
    }

    return normalizedOriginal;
  }

  /**
   * Actually perform the file/directory move
   */
  private async performMove(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    await this.ensureDirectoryExists(dirname(destinationPath));

    const sourceStats = await stat(sourcePath);

    if (sourceStats.isDirectory()) {
      await this.moveDirectory(sourcePath, destinationPath);
    } else {
      await rename(sourcePath, destinationPath);
    }
  }

  /**
   * Move a directory, handling the case where destination exists
   */
  private async moveDirectory(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    try {
      // Try direct rename first (most efficient)
      await rename(sourcePath, destinationPath);
    } catch (error: any) {
      if (error.code === "ENOTEMPTY" || error.code === "EEXIST") {
        // Destination exists and is not empty, need to merge contents
        await this.mergeDirectories(sourcePath, destinationPath);
      } else {
        throw error;
      }
    }
  }

  /**
   * Merge contents of source directory into destination directory
   */
  private async mergeDirectories(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    // Ensure destination directory exists
    await this.ensureDirectoryExists(destinationPath);

    // Get all items in source directory
    const items = await readdir(sourcePath, { withFileTypes: true });

    // Move each item
    for (const item of items) {
      const sourceItemPath = join(sourcePath, item.name);
      const destItemPath = join(destinationPath, item.name);

      if (item.isDirectory()) {
        // Recursively move subdirectory
        await this.moveDirectory(sourceItemPath, destItemPath);
      } else {
        // Move file
        await this.ensureDirectoryExists(dirname(destItemPath));
        await rename(sourceItemPath, destItemPath);
      }
    }

    // Remove empty source directory
    try {
      await rmdir(sourcePath);
    } catch (error: any) {
      // Ignore if directory is not empty (might happen due to race conditions)
      if (error.code !== "ENOTEMPTY") {
        throw error;
      }
    }
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Move files matching a glob pattern to the destination directory
   */
  private async moveGlobPattern(
    globPattern: string,
    destinationPath: string
  ): Promise<void> {
    if (this.config.verbose) {
      console.log(
        `${this.config.dryRun ? "Would resolve" : "Resolving"} glob pattern:`
      );
      console.log(`  Pattern: ${globPattern}`);
      console.log(`  Root: ${this.config.rootDir}`);
      console.log(`  Destination: ${destinationPath}`);
    }

    // Resolve glob pattern to actual file paths
    const matchedFiles = await globby([globPattern], {
      cwd: this.config.rootDir,
      absolute: true,
      onlyFiles: false, // Include directories too
      gitignore: this.config.respectGitignore,
    });

    if (this.config.verbose) {
      console.log(`  Globby found ${matchedFiles.length} matches:`);
      matchedFiles.forEach((file) => {
        console.log(
          `    ${normalizePath(relative(this.config.rootDir, file))}`
        );
      });
    }

    if (matchedFiles.length === 0) {
      console.log(`No files match the pattern: ${globPattern}`);
      return;
    }

    if (this.config.verbose) {
      console.log(`  Found ${matchedFiles.length} matching items`);
      console.log();
    }

    // Ensure destination directory exists
    if (!this.config.dryRun) {
      await this.ensureDirectoryExists(destinationPath);
    }

    let totalUpdates = 0;
    let totalFiles = 0;
    let movedItems = 0;

    // Move each matched file/directory
    for (const matchedPath of matchedFiles) {
      try {
        // Determine the destination path for this item
        const itemDestinationPath = await this.calculateGlobDestination(
          matchedPath,
          globPattern,
          destinationPath
        );

        // Find all files that might be affected by this individual move
        const allFiles = await this.fileDiscovery.findAllFiles();
        const filesWithImports = await this.parseImportsForFiles(allFiles);

        // Find files that need to be updated for this specific move
        const filesToUpdate = await this.findFilesToUpdate(
          filesWithImports,
          matchedPath,
          itemDestinationPath
        );

        // Update import references for this move
        const updateResults = await this.updateImportReferences(
          filesToUpdate,
          matchedPath,
          itemDestinationPath,
          (await stat(matchedPath)).isDirectory()
        );

        // Actually move the item (unless dry run)
        if (!this.config.dryRun) {
          await this.performMove(matchedPath, itemDestinationPath);
        }

        // Accumulate results
        totalUpdates += updateResults.reduce(
          (sum, result) => sum + result.updatedImports,
          0
        );
        totalFiles += updateResults.length;
        movedItems++;

        if (this.config.verbose) {
          const stats = await stat(matchedPath);
          const itemType = stats.isDirectory() ? "directory" : "file";
          const sourceRel = normalizePath(
            relative(this.config.rootDir, matchedPath)
          );
          const destRel = normalizePath(
            relative(this.config.rootDir, itemDestinationPath)
          );
          console.log(
            `  ${
              this.config.dryRun ? "Would move" : "Moved"
            } ${itemType}: ${sourceRel} → ${destRel}`
          );
        }
      } catch (error) {
        console.error(
          `Error moving ${normalizePath(
            relative(this.config.rootDir, matchedPath)
          )}: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue with other items
      }
    }

    // Report final results
    const actionText = this.config.dryRun ? "Would move" : "Moved";
    console.log(
      `\n✅ ${actionText} ${movedItems} item(s) matching pattern '${globPattern}' successfully!`
    );

    if (totalFiles > 0) {
      console.log(
        `Updated ${totalUpdates} import(s) across ${totalFiles} file(s).`
      );
    } else {
      console.log("No import references needed updating.");
    }
  }

  /**
   * Calculate the destination path for an item matched by a glob pattern
   * Rule: For glob patterns, destination is always treated as a folder
   */
  private async calculateGlobDestination(
    matchedPath: string,
    globPattern: string,
    destinationPath: string
  ): Promise<string> {
    // For glob patterns, always treat destination as a folder
    // and move each file to that folder with its original filename
    const filename = basename(matchedPath);
    return resolve(destinationPath, filename);
  }

  /**
   * Extract the base directory from a glob pattern
   */
  private getGlobBase(globPattern: string): string {
    // Remove glob characters to find the base directory
    const basePattern = globPattern
      .replace(/\/\*\*.*$/, "") // Remove /**/* and everything after
      .replace(/\/\*.*$/, "") // Remove /* and everything after
      .replace(/[*?[\]{}].*$/, ""); // Remove other glob chars and everything after

    return basePattern || ".";
  }

  /**
   * Move all contents of a directory to the destination directory
   */
  private async moveDirectoryContents(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    const { readdir } = await import("fs/promises");

    if (this.config.verbose) {
      console.log(
        `${this.config.dryRun ? "Would move" : "Moving"} directory contents:`
      );
      console.log(`  From: ${sourcePath}/*`);
      console.log(`  To: ${destinationPath}`);
      console.log();
    }

    // Ensure destination directory exists
    if (!this.config.dryRun) {
      await this.ensureDirectoryExists(destinationPath);
    }

    // Get all items in source directory
    const items = await readdir(sourcePath, { withFileTypes: true });

    if (items.length === 0) {
      console.log("Source directory is empty, nothing to move.");
      return;
    }

    let totalUpdates = 0;
    let totalFiles = 0;

    // Move each item individually
    for (const item of items) {
      const itemSourcePath = join(sourcePath, item.name);
      const itemDestinationPath = join(destinationPath, item.name);

      try {
        // Find all files that might be affected by this individual move
        const allFiles = await this.fileDiscovery.findAllFiles();
        const filesWithImports = await this.parseImportsForFiles(allFiles);

        // Find files that need to be updated for this specific move
        const filesToUpdate = await this.findFilesToUpdate(
          filesWithImports,
          itemSourcePath,
          itemDestinationPath
        );

        // Update import references for this move
        const updateResults = await this.updateImportReferences(
          filesToUpdate,
          itemSourcePath,
          itemDestinationPath,
          item.isDirectory()
        );

        // Actually move the item (unless dry run)
        if (!this.config.dryRun) {
          await this.performMove(itemSourcePath, itemDestinationPath);
        }

        // Accumulate results
        totalUpdates += updateResults.reduce(
          (sum, result) => sum + result.updatedImports,
          0
        );
        totalFiles += updateResults.length;

        if (this.config.verbose) {
          const itemType = item.isDirectory() ? "directory" : "file";
          const sourceRel = normalizePath(
            relative(this.config.rootDir, itemSourcePath)
          );
          const destRel = normalizePath(
            relative(this.config.rootDir, itemDestinationPath)
          );
          console.log(
            `  ${
              this.config.dryRun ? "Would move" : "Moved"
            } ${itemType}: ${sourceRel} → ${destRel}`
          );
        }
      } catch (error) {
        console.error(
          `Error moving ${item.name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Continue with other items
      }
    }

    // Report final results
    const actionText = this.config.dryRun ? "Would move" : "Moved";
    console.log(
      `\n✅ ${actionText} ${items.length} item(s) from directory contents successfully!`
    );

    if (totalFiles > 0) {
      console.log(
        `Updated ${totalUpdates} import(s) across ${totalFiles} file(s).`
      );
    } else {
      console.log("No import references needed updating.");
    }

    // Optionally remove empty source directory
    if (!this.config.dryRun) {
      try {
        const remainingItems = await readdir(sourcePath);
        if (remainingItems.length === 0) {
          const { rmdir } = await import("fs/promises");
          await rmdir(sourcePath);
          if (this.config.verbose) {
            console.log(
              `Removed empty source directory: ${normalizePath(
                relative(this.config.rootDir, sourcePath)
              )}`
            );
          }
        }
      } catch (error) {
        // Ignore errors when trying to clean up empty directory
        if (this.config.verbose) {
          console.warn(
            `Warning: Could not remove source directory ${sourcePath}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }
  }

  /**
   * Report the results of the move operation
   */
  private reportResults(
    results: UpdateResult[],
    sourcePath: string,
    destinationPath: string,
    isDirectory: boolean
  ): void {
    const actionText = this.config.dryRun ? "Would move" : "Moved";
    const sourceRel = normalizePath(relative(this.config.rootDir, sourcePath));
    const destRel = normalizePath(
      relative(this.config.rootDir, destinationPath)
    );

    console.log(
      `\n${actionText} ${
        isDirectory ? "directory" : "file"
      }: ${sourceRel} → ${destRel}`
    );

    if (results.length === 0) {
      console.log("No import references needed updating.");
      return;
    }

    console.log(`\nUpdated imports in ${results.length} file(s):`);

    for (const result of results) {
      const relativeFilePath = normalizePath(
        relative(this.config.rootDir, result.filePath)
      );
      console.log(
        `\n📝 ${relativeFilePath} (${result.updatedImports} import(s))`
      );

      if (this.config.verbose) {
        for (const change of result.changes) {
          console.log(
            `  Line ${change.line}: "${change.from}" → "${change.to}"`
          );
        }
      }
    }

    const totalUpdates = results.reduce(
      (sum, result) => sum + result.updatedImports,
      0
    );
    console.log(
      `\n✅ ${actionText.toLowerCase()} successfully! Updated ${totalUpdates} import(s) across ${
        results.length
      } file(s).`
    );
  }
}
