#!/usr/bin/env node

// src/cli.ts
import { program } from "commander";
import { resolve as resolve4 } from "path";

// src/file-mover.ts
import { existsSync as existsSync3 } from "fs";
import { mkdir, readdir, rename, rmdir, stat, writeFile } from "fs/promises";
import { globby as globby2 } from "globby";
import { dirname as dirname2, join as join2, relative as relative3, resolve as resolve3 } from "path";

// src/file-discovery.ts
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { globby } from "globby";
import ignore from "ignore";
import { extname, join, relative, resolve } from "path";
var FileDiscovery = class {
  config;
  ignoreFilter;
  constructor(config) {
    this.config = config;
  }
  /**
   * Initialize the ignore filter by reading .gitignore files
   */
  async initializeIgnoreFilter() {
    if (!this.config.respectGitignore) {
      return;
    }
    const ig = ignore();
    let currentDir = this.config.rootDir;
    const visited = /* @__PURE__ */ new Set();
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
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
    this.ignoreFilter = ig;
  }
  /**
   * Find all files in the project matching the configured extensions
   */
  async findAllFiles() {
    await this.initializeIgnoreFilter();
    const patterns = this.config.fileExtensions.map((ext) => `**/*${ext}`);
    if (this.config.verbose) {
      console.log(`Searching for files with patterns: ${patterns.join(", ")}`);
      console.log(`Root directory: ${this.config.rootDir}`);
    }
    const filePaths = await globby(patterns, {
      cwd: this.config.rootDir,
      absolute: true,
      gitignore: this.config.respectGitignore
    });
    const filteredPaths = this.ignoreFilter ? filePaths.filter((path) => {
      const relativePath = relative(this.config.rootDir, path);
      return !this.ignoreFilter.ignores(relativePath);
    }) : filePaths;
    if (this.config.verbose) {
      console.log(`Found ${filteredPaths.length} files to process`);
    }
    const fileInfoPromises = filteredPaths.map(
      async (absolutePath) => {
        const relativePath = relative(this.config.rootDir, absolutePath);
        const extension = extname(absolutePath);
        try {
          const content = await readFile(absolutePath, "utf-8");
          return {
            absolutePath,
            relativePath,
            extension,
            content,
            imports: []
            // Will be populated later by import parser
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
  isIgnored(filePath) {
    if (!this.ignoreFilter) {
      return false;
    }
    const relativePath = relative(this.config.rootDir, filePath);
    return this.ignoreFilter.ignores(relativePath);
  }
  /**
   * Find files that might be affected by moving a specific file or directory
   */
  async findAffectedFiles(movePath) {
    const allFiles = await this.findAllFiles();
    const movePathRelative = relative(this.config.rootDir, movePath);
    if (this.config.verbose) {
      console.log(`Looking for files affected by moving: ${movePathRelative}`);
    }
    return allFiles;
  }
};

// src/import-parser.ts
var ImportParser = class {
  /**
   * Parse imports from a file based on its extension
   */
  parseImports(file) {
    switch (file.extension) {
      case ".vue":
        return this.parseVueFile(file.content);
      case ".ts":
      case ".tsx":
      case ".js":
      case ".jsx":
        return this.parseJsFile(file.content);
      default:
        return [];
    }
  }
  /**
   * Parse imports from a Vue single-file component
   */
  parseVueFile(content) {
    const imports = [];
    const scriptBlocks = this.extractVueScriptBlocks(content);
    for (const block of scriptBlocks) {
      const blockImports = this.parseJsFile(block.content);
      const adjustedImports = blockImports.map((imp) => ({
        ...imp,
        start: imp.start + block.offset,
        end: imp.end + block.offset,
        line: imp.line + block.startLine - 1
      }));
      imports.push(...adjustedImports);
    }
    const templateImports = this.parseVueTemplate(content);
    imports.push(...templateImports);
    return imports;
  }
  /**
   * Extract script blocks from Vue SFC
   */
  extractVueScriptBlocks(content) {
    const blocks = [];
    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const scriptContent = match[1] ?? "";
      const offset = match.index + fullMatch.indexOf(scriptContent);
      const beforeScript = content.substring(0, match.index);
      const startLine = (beforeScript.match(/\n/g) || []).length + 1;
      blocks.push({
        content: scriptContent,
        offset,
        startLine: startLine + (fullMatch.substring(0, fullMatch.indexOf(scriptContent)).match(/\n/g) || []).length
      });
    }
    return blocks;
  }
  /**
   * Parse Vue template for dynamic imports (though less common)
   */
  parseVueTemplate(content) {
    const imports = [];
    const templateRegex = /<template(?:\s+[^>]*)?>([\s\S]*?)<\/template>/gi;
    const match = templateRegex.exec(content);
    if (match) {
      const templateContent = match[1] ?? "";
      const templateOffset = match.index + match[0].indexOf(templateContent);
      const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      let dynamicMatch;
      while ((dynamicMatch = dynamicImportRegex.exec(templateContent)) !== null) {
        const beforeMatch = content.substring(
          0,
          templateOffset + dynamicMatch.index
        );
        const line = (beforeMatch.match(/\n/g) || []).length + 1;
        imports.push({
          original: dynamicMatch[0],
          path: dynamicMatch[1],
          start: templateOffset + dynamicMatch.index,
          end: templateOffset + dynamicMatch.index + dynamicMatch[0].length,
          type: "dynamic",
          line
        });
      }
    }
    return imports;
  }
  /**
   * Parse imports from JavaScript/TypeScript files
   */
  parseJsFile(content) {
    const imports = [];
    imports.push(...this.parseStaticImports(content));
    imports.push(...this.parseDynamicImports(content));
    imports.push(...this.parseRequireStatements(content));
    return imports;
  }
  /**
   * Parse static ES6 import statements
   */
  parseStaticImports(content) {
    const imports = [];
    const importRegex = /^[\s]*import\s+(?:type\s+)?(?:(?:\*\s+as\s+\w+)|(?:\w+(?:\s*,\s*)?)|(?:\{[^}]*\}(?:\s*,\s*)?)|(?:\w+\s*,\s*\{[^}]*\}))?\s+from\s+[\s]*['"`]([^'"`]+)['"`][\s]*;?$/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;
      imports.push({
        original: match[0],
        path: match[1],
        start: match.index,
        end: match.index + match[0].length,
        type: "static",
        line
      });
    }
    return imports;
  }
  /**
   * Parse dynamic import() statements
   */
  parseDynamicImports(content) {
    const imports = [];
    const dynamicImportRegex = /import\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
    let match;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;
      imports.push({
        original: match[0],
        path: match[2],
        start: match.index,
        end: match.index + match[0].length,
        type: "dynamic",
        line
      });
    }
    return imports;
  }
  /**
   * Parse require() statements (CommonJS)
   */
  parseRequireStatements(content) {
    const imports = [];
    const requireRegex = /require\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;
      imports.push({
        original: match[0],
        path: match[2],
        start: match.index,
        end: match.index + match[0].length,
        type: "static",
        // Treating require as static for simplicity
        line
      });
    }
    return imports;
  }
  /**
   * Update file content with new import paths
   */
  updateImportsInContent(content, updates) {
    const sortedUpdates = [...updates].sort(
      (a, b) => b.from.start - a.from.start
    );
    let updatedContent = content;
    for (const update of sortedUpdates) {
      const { from, to } = update;
      const originalImport = from.original;
      const newImport = originalImport.replace(
        new RegExp(`(['"\`])${this.escapeRegex(from.path)}\\1`),
        `$1${to}$1`
      );
      updatedContent = updatedContent.substring(0, from.start) + newImport + updatedContent.substring(from.end);
    }
    return updatedContent;
  }
  /**
   * Escape special regex characters in a string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
};

// src/path-resolver.ts
import { existsSync as existsSync2 } from "fs";
import { dirname, extname as extname2, isAbsolute, relative as relative2, resolve as resolve2 } from "path";
var PathResolver = class {
  config;
  constructor(config) {
    this.config = config;
  }
  /**
   * Resolve an import path to an absolute path
   */
  resolveImportPath(importPath, fromFile) {
    if (isAbsolute(importPath)) {
      return importPath;
    }
    const aliasResolved = this.resolveAliasPath(importPath);
    if (aliasResolved) {
      return this.findActualFile(aliasResolved);
    }
    const fromDir = dirname(fromFile);
    const resolvedPath = resolve2(fromDir, importPath);
    return this.findActualFile(resolvedPath);
  }
  /**
   * Resolve alias paths like @/components or ~/utils
   */
  resolveAliasPath(importPath) {
    for (const alias of this.config.aliases) {
      if (importPath.startsWith(alias.alias + "/")) {
        const relativePath = importPath.substring(alias.alias.length + 1);
        return resolve2(alias.path, relativePath);
      } else if (importPath === alias.alias) {
        return alias.path;
      }
    }
    return null;
  }
  /**
   * Find the actual file path, trying different extensions if needed
   */
  findActualFile(basePath) {
    if (existsSync2(basePath)) {
      return basePath;
    }
    if (!extname2(basePath)) {
      const extensionsToTry = [".ts", ".tsx", ".js", ".jsx", ".vue"];
      for (const ext of extensionsToTry) {
        const pathWithExt = basePath + ext;
        if (existsSync2(pathWithExt)) {
          return pathWithExt;
        }
      }
      const indexExtensions = [
        "/index.ts",
        "/index.tsx",
        "/index.js",
        "/index.jsx",
        "/index.vue"
      ];
      for (const indexExt of indexExtensions) {
        const indexPath = basePath + indexExt;
        if (existsSync2(indexPath)) {
          return indexPath;
        }
      }
    }
    return null;
  }
  /**
   * Calculate new import path when a file is moved
   */
  calculateNewImportPath(originalImportPath, fromFile, movedFromPath, movedToPath, newFromFile) {
    const absoluteImportPath = this.resolveImportPath(
      originalImportPath,
      fromFile
    );
    if (!absoluteImportPath) {
      return null;
    }
    const isImportingMovedFile = this.isPathAffectedByMove(
      absoluteImportPath,
      movedFromPath,
      movedToPath
    );
    if (!isImportingMovedFile && !newFromFile) {
      return null;
    }
    let newAbsoluteImportPath = absoluteImportPath;
    if (isImportingMovedFile) {
      newAbsoluteImportPath = this.getNewPathAfterMove(
        absoluteImportPath,
        movedFromPath,
        movedToPath
      );
    }
    const effectiveFromFile = newFromFile || fromFile;
    const newImportPath = this.calculateRelativeImportPath(
      newAbsoluteImportPath,
      effectiveFromFile,
      originalImportPath
    );
    if (newImportPath === originalImportPath) {
      return null;
    }
    return newImportPath;
  }
  /**
   * Check if a path is affected by a move operation
   */
  isPathAffectedByMove(targetPath, movedFromPath, _movedToPath) {
    const normalizedTarget = resolve2(targetPath);
    const normalizedFrom = resolve2(movedFromPath);
    return normalizedTarget === normalizedFrom || normalizedTarget.startsWith(normalizedFrom + "/");
  }
  /**
   * Get the new path after a move operation
   */
  getNewPathAfterMove(originalPath, movedFromPath, movedToPath) {
    const normalizedOriginal = resolve2(originalPath);
    const normalizedFrom = resolve2(movedFromPath);
    const normalizedTo = resolve2(movedToPath);
    if (normalizedOriginal === normalizedFrom) {
      return normalizedTo;
    } else if (normalizedOriginal.startsWith(normalizedFrom + "/")) {
      const relativePath = relative2(normalizedFrom, normalizedOriginal);
      return resolve2(normalizedTo, relativePath);
    }
    return normalizedOriginal;
  }
  /**
   * Calculate the appropriate import path (relative, alias, or absolute)
   */
  calculateRelativeImportPath(targetPath, fromFile, originalImportPath) {
    const fromDir = dirname(fromFile);
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
      const anyAliasPath = this.tryConvertToAliasPath(
        targetPath,
        originalImportPath
      );
      if (anyAliasPath) {
        return anyAliasPath;
      }
    }
    let relativePath = relative2(fromDir, targetPath);
    const originalHasExtension = extname2(originalImportPath) !== "";
    const targetHasExtension = extname2(relativePath) !== "";
    if (!originalHasExtension && targetHasExtension) {
      const extensionsToRemove = [".ts", ".tsx", ".js", ".jsx"];
      const currentExt = extname2(relativePath);
      if (extensionsToRemove.includes(currentExt)) {
        relativePath = relativePath.slice(0, -currentExt.length);
      }
    }
    if (!relativePath.startsWith(".") && !relativePath.startsWith("/")) {
      relativePath = "./" + relativePath;
    }
    return relativePath;
  }
  /**
   * Check if an import path uses an alias
   */
  isAliasImport(importPath) {
    return this.config.aliases.some(
      (alias) => importPath.startsWith(alias.alias + "/") || importPath === alias.alias
    );
  }
  /**
   * Try to convert an absolute path to an alias path
   */
  tryConvertToAliasPath(absolutePath, originalImportPath) {
    for (const alias of this.config.aliases) {
      const aliasAbsolutePath = resolve2(alias.path);
      if (absolutePath.startsWith(aliasAbsolutePath + "/")) {
        const relativePath = relative2(aliasAbsolutePath, absolutePath);
        let aliasPath = alias.alias + "/" + relativePath;
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
  getOriginalAlias(importPath) {
    for (const alias of this.config.aliases) {
      if (importPath.startsWith(alias.alias + "/") || importPath === alias.alias) {
        return alias.alias;
      }
    }
    return null;
  }
  /**
   * Try to convert an absolute path to a specific alias path
   */
  tryConvertToSpecificAliasPath(absolutePath, preferredAlias, originalImportPath) {
    const aliasConfig = this.config.aliases.find(
      (alias) => alias.alias === preferredAlias
    );
    if (!aliasConfig) {
      return null;
    }
    const aliasAbsolutePath = resolve2(aliasConfig.path);
    if (absolutePath.startsWith(aliasAbsolutePath + "/")) {
      const relativePath = relative2(aliasAbsolutePath, absolutePath);
      let aliasPath = preferredAlias + "/" + relativePath;
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
  preserveExtensionBehavior(newPath, originalImportPath) {
    const originalHasExtension = extname2(originalImportPath) !== "";
    const newHasExtension = extname2(newPath) !== "";
    if (!originalHasExtension && newHasExtension) {
      const extensionsToRemove = [".ts", ".tsx", ".js", ".jsx"];
      const currentExt = extname2(newPath);
      if (extensionsToRemove.includes(currentExt)) {
        return newPath.slice(0, -currentExt.length);
      }
    }
    return newPath;
  }
  /**
   * Check if two files are the same (accounting for different extensions)
   */
  isSameFile(path1, path2) {
    const resolved1 = this.findActualFile(path1);
    const resolved2 = this.findActualFile(path2);
    return resolved1 !== null && resolved2 !== null && resolved1 === resolved2;
  }
};

// src/file-mover.ts
var FileMover = class {
  config;
  fileDiscovery;
  importParser;
  pathResolver;
  constructor(config) {
    this.config = config;
    this.fileDiscovery = new FileDiscovery(config);
    this.importParser = new ImportParser();
    this.pathResolver = new PathResolver(config);
  }
  /**
   * Move a file or directory and update all import references
   */
  async move(sourcePath, destinationPath, useGlobPattern = false) {
    if (useGlobPattern) {
      return await this.moveGlobPattern(sourcePath, destinationPath);
    }
    if (!existsSync3(sourcePath)) {
      throw new Error(`Source path does not exist: ${sourcePath}`);
    }
    const sourceStats = await stat(sourcePath);
    const isSourceDirectory = sourceStats.isDirectory();
    let finalDestinationPath = destinationPath;
    if (existsSync3(destinationPath)) {
      const destStats = await stat(destinationPath);
      if (destStats.isDirectory()) {
        const sourceFilename = sourcePath.split("/").pop();
        finalDestinationPath = resolve3(destinationPath, sourceFilename);
      }
    } else if (destinationPath.endsWith("/") || existsSync3(dirname2(destinationPath)) && (await stat(dirname2(destinationPath))).isDirectory() && !destinationPath.includes(".")) {
      const sourceFilename = sourcePath.split("/").pop();
      finalDestinationPath = resolve3(destinationPath, sourceFilename);
    }
    if (this.config.verbose) {
      console.log(
        `${this.config.dryRun ? "Would move" : "Moving"} ${isSourceDirectory ? "directory" : "file"}:`
      );
      console.log(`  From: ${sourcePath}`);
      console.log(`  To: ${finalDestinationPath}`);
      console.log();
    }
    const allFiles = await this.fileDiscovery.findAllFiles();
    const filesWithImports = await this.parseImportsForFiles(allFiles);
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
    const updateResults = await this.updateImportReferences(
      filesToUpdate,
      sourcePath,
      finalDestinationPath,
      isSourceDirectory
    );
    if (!this.config.dryRun) {
      await this.performMove(sourcePath, finalDestinationPath);
    }
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
  async scan() {
    console.log("Scanning directory for files and imports...\n");
    const allFiles = await this.fileDiscovery.findAllFiles();
    const filesWithImports = await this.parseImportsForFiles(allFiles);
    for (const file of filesWithImports) {
      if (file.imports.length > 0) {
        console.log(`\u{1F4C1} ${file.relativePath}`);
        for (const imp of file.imports) {
          const resolvedPath = this.pathResolver.resolveImportPath(
            imp.path,
            file.absolutePath
          );
          const status = resolvedPath && existsSync3(resolvedPath) ? "\u2705" : "\u274C";
          console.log(`  ${status} Line ${imp.line}: ${imp.original.trim()}`);
          if (resolvedPath && this.config.verbose) {
            console.log(
              `      Resolves to: ${relative3(this.config.rootDir, resolvedPath)}`
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
  async parseImportsForFiles(files) {
    return files.map((file) => ({
      ...file,
      imports: this.importParser.parseImports(file)
    }));
  }
  /**
   * Find files that need import updates
   */
  async findFilesToUpdate(files, sourcePath, destinationPath) {
    const filesToUpdate = [];
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
  async fileNeedsUpdate(file, sourcePath, destinationPath) {
    const isFileMoved = this.isPathAffectedByMove(
      file.absolutePath,
      sourcePath,
      destinationPath
    );
    const hasAffectedImports = file.imports.some((imp) => {
      const resolvedPath = this.pathResolver.resolveImportPath(
        imp.path,
        file.absolutePath
      );
      return resolvedPath && this.isPathAffectedByMove(resolvedPath, sourcePath, destinationPath);
    });
    return isFileMoved || hasAffectedImports;
  }
  /**
   * Check if a path is affected by the move operation
   */
  isPathAffectedByMove(targetPath, sourcePath, _destinationPath) {
    const normalizedTarget = resolve3(targetPath);
    const normalizedSource = resolve3(sourcePath);
    return normalizedTarget === normalizedSource || normalizedTarget.startsWith(normalizedSource + "/");
  }
  /**
   * Update import references in files
   */
  async updateImportReferences(files, sourcePath, destinationPath, isDirectory) {
    const results = [];
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
  async updateFileImports(file, sourcePath, destinationPath) {
    const updates = [];
    const changes = [];
    const isFileMoved = this.isPathAffectedByMove(
      file.absolutePath,
      sourcePath,
      destinationPath
    );
    const newFilePath = isFileMoved ? this.getNewPathAfterMove(file.absolutePath, sourcePath, destinationPath) : file.absolutePath;
    for (const imp of file.imports) {
      const newImportPath = this.pathResolver.calculateNewImportPath(
        imp.path,
        file.absolutePath,
        sourcePath,
        destinationPath,
        isFileMoved ? newFilePath : void 0
      );
      if (newImportPath && newImportPath !== imp.path) {
        updates.push({ from: imp, to: newImportPath });
        changes.push({
          line: imp.line,
          from: imp.path,
          to: newImportPath
        });
      }
    }
    let updatedContent = file.content;
    if (updates.length > 0) {
      updatedContent = this.importParser.updateImportsInContent(
        file.content,
        updates
      );
      if (!this.config.dryRun) {
        await writeFile(file.absolutePath, updatedContent, "utf-8");
      }
    }
    return {
      filePath: isFileMoved ? newFilePath : file.absolutePath,
      updatedImports: updates.length,
      changes
    };
  }
  /**
   * Get the new path after a move operation
   */
  getNewPathAfterMove(originalPath, sourcePath, destinationPath) {
    const normalizedOriginal = resolve3(originalPath);
    const normalizedSource = resolve3(sourcePath);
    const normalizedDestination = resolve3(destinationPath);
    if (normalizedOriginal === normalizedSource) {
      return normalizedDestination;
    } else if (normalizedOriginal.startsWith(normalizedSource + "/")) {
      const relativePath = relative3(normalizedSource, normalizedOriginal);
      return resolve3(normalizedDestination, relativePath);
    }
    return normalizedOriginal;
  }
  /**
   * Actually perform the file/directory move
   */
  async performMove(sourcePath, destinationPath) {
    await this.ensureDirectoryExists(dirname2(destinationPath));
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
  async moveDirectory(sourcePath, destinationPath) {
    try {
      await rename(sourcePath, destinationPath);
    } catch (error) {
      if (error.code === "ENOTEMPTY" || error.code === "EEXIST") {
        await this.mergeDirectories(sourcePath, destinationPath);
      } else {
        throw error;
      }
    }
  }
  /**
   * Merge contents of source directory into destination directory
   */
  async mergeDirectories(sourcePath, destinationPath) {
    await this.ensureDirectoryExists(destinationPath);
    const items = await readdir(sourcePath, { withFileTypes: true });
    for (const item of items) {
      const sourceItemPath = join2(sourcePath, item.name);
      const destItemPath = join2(destinationPath, item.name);
      if (item.isDirectory()) {
        await this.moveDirectory(sourceItemPath, destItemPath);
      } else {
        await this.ensureDirectoryExists(dirname2(destItemPath));
        await rename(sourceItemPath, destItemPath);
      }
    }
    try {
      await rmdir(sourcePath);
    } catch (error) {
      if (error.code !== "ENOTEMPTY") {
        throw error;
      }
    }
  }
  /**
   * Ensure a directory exists
   */
  async ensureDirectoryExists(dirPath) {
    if (!existsSync3(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }
  /**
   * Move files matching a glob pattern to the destination directory
   */
  async moveGlobPattern(globPattern, destinationPath) {
    if (this.config.verbose) {
      console.log(
        `${this.config.dryRun ? "Would resolve" : "Resolving"} glob pattern:`
      );
      console.log(`  Pattern: ${globPattern}`);
      console.log(`  Root: ${this.config.rootDir}`);
      console.log(`  Destination: ${destinationPath}`);
    }
    const matchedFiles = await globby2([globPattern], {
      cwd: this.config.rootDir,
      absolute: true,
      onlyFiles: false,
      // Include directories too
      gitignore: this.config.respectGitignore
    });
    if (this.config.verbose) {
      console.log(`  Globby found ${matchedFiles.length} matches:`);
      matchedFiles.forEach((file) => {
        console.log(`    ${relative3(this.config.rootDir, file)}`);
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
    if (!this.config.dryRun) {
      await this.ensureDirectoryExists(destinationPath);
    }
    let totalUpdates = 0;
    let totalFiles = 0;
    let movedItems = 0;
    for (const matchedPath of matchedFiles) {
      try {
        const itemDestinationPath = await this.calculateGlobDestination(
          matchedPath,
          globPattern,
          destinationPath
        );
        const allFiles = await this.fileDiscovery.findAllFiles();
        const filesWithImports = await this.parseImportsForFiles(allFiles);
        const filesToUpdate = await this.findFilesToUpdate(
          filesWithImports,
          matchedPath,
          itemDestinationPath
        );
        const updateResults = await this.updateImportReferences(
          filesToUpdate,
          matchedPath,
          itemDestinationPath,
          (await stat(matchedPath)).isDirectory()
        );
        if (!this.config.dryRun) {
          await this.performMove(matchedPath, itemDestinationPath);
        }
        totalUpdates += updateResults.reduce(
          (sum, result) => sum + result.updatedImports,
          0
        );
        totalFiles += updateResults.length;
        movedItems++;
        if (this.config.verbose) {
          const stats = await stat(matchedPath);
          const itemType = stats.isDirectory() ? "directory" : "file";
          const sourceRel = relative3(this.config.rootDir, matchedPath);
          const destRel = relative3(this.config.rootDir, itemDestinationPath);
          console.log(
            `  ${this.config.dryRun ? "Would move" : "Moved"} ${itemType}: ${sourceRel} \u2192 ${destRel}`
          );
        }
      } catch (error) {
        console.error(
          `Error moving ${relative3(this.config.rootDir, matchedPath)}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    const actionText = this.config.dryRun ? "Would move" : "Moved";
    console.log(
      `
\u2705 ${actionText} ${movedItems} item(s) matching pattern '${globPattern}' successfully!`
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
  async calculateGlobDestination(matchedPath, globPattern, destinationPath) {
    const filename = matchedPath.split("/").pop();
    return resolve3(destinationPath, filename);
  }
  /**
   * Extract the base directory from a glob pattern
   */
  getGlobBase(globPattern) {
    const basePattern = globPattern.replace(/\/\*\*.*$/, "").replace(/\/\*.*$/, "").replace(/[*?[\]{}].*$/, "");
    return basePattern || ".";
  }
  /**
   * Move all contents of a directory to the destination directory
   */
  async moveDirectoryContents(sourcePath, destinationPath) {
    const { readdir: readdir2 } = await import("fs/promises");
    if (this.config.verbose) {
      console.log(
        `${this.config.dryRun ? "Would move" : "Moving"} directory contents:`
      );
      console.log(`  From: ${sourcePath}/*`);
      console.log(`  To: ${destinationPath}`);
      console.log();
    }
    if (!this.config.dryRun) {
      await this.ensureDirectoryExists(destinationPath);
    }
    const items = await readdir2(sourcePath, { withFileTypes: true });
    if (items.length === 0) {
      console.log("Source directory is empty, nothing to move.");
      return;
    }
    let totalUpdates = 0;
    let totalFiles = 0;
    for (const item of items) {
      const itemSourcePath = join2(sourcePath, item.name);
      const itemDestinationPath = join2(destinationPath, item.name);
      try {
        const allFiles = await this.fileDiscovery.findAllFiles();
        const filesWithImports = await this.parseImportsForFiles(allFiles);
        const filesToUpdate = await this.findFilesToUpdate(
          filesWithImports,
          itemSourcePath,
          itemDestinationPath
        );
        const updateResults = await this.updateImportReferences(
          filesToUpdate,
          itemSourcePath,
          itemDestinationPath,
          item.isDirectory()
        );
        if (!this.config.dryRun) {
          await this.performMove(itemSourcePath, itemDestinationPath);
        }
        totalUpdates += updateResults.reduce(
          (sum, result) => sum + result.updatedImports,
          0
        );
        totalFiles += updateResults.length;
        if (this.config.verbose) {
          const itemType = item.isDirectory() ? "directory" : "file";
          const sourceRel = relative3(this.config.rootDir, itemSourcePath);
          const destRel = relative3(this.config.rootDir, itemDestinationPath);
          console.log(
            `  ${this.config.dryRun ? "Would move" : "Moved"} ${itemType}: ${sourceRel} \u2192 ${destRel}`
          );
        }
      } catch (error) {
        console.error(
          `Error moving ${item.name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    const actionText = this.config.dryRun ? "Would move" : "Moved";
    console.log(
      `
\u2705 ${actionText} ${items.length} item(s) from directory contents successfully!`
    );
    if (totalFiles > 0) {
      console.log(
        `Updated ${totalUpdates} import(s) across ${totalFiles} file(s).`
      );
    } else {
      console.log("No import references needed updating.");
    }
    if (!this.config.dryRun) {
      try {
        const remainingItems = await readdir2(sourcePath);
        if (remainingItems.length === 0) {
          const { rmdir: rmdir2 } = await import("fs/promises");
          await rmdir2(sourcePath);
          if (this.config.verbose) {
            console.log(
              `Removed empty source directory: ${relative3(this.config.rootDir, sourcePath)}`
            );
          }
        }
      } catch (error) {
        if (this.config.verbose) {
          console.warn(
            `Warning: Could not remove source directory ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }
  /**
   * Report the results of the move operation
   */
  reportResults(results, sourcePath, destinationPath, isDirectory) {
    const actionText = this.config.dryRun ? "Would move" : "Moved";
    const sourceRel = relative3(this.config.rootDir, sourcePath);
    const destRel = relative3(this.config.rootDir, destinationPath);
    console.log(
      `
${actionText} ${isDirectory ? "directory" : "file"}: ${sourceRel} \u2192 ${destRel}`
    );
    if (results.length === 0) {
      console.log("No import references needed updating.");
      return;
    }
    console.log(`
Updated imports in ${results.length} file(s):`);
    for (const result of results) {
      const relativeFilePath = relative3(this.config.rootDir, result.filePath);
      console.log(
        `
\u{1F4DD} ${relativeFilePath} (${result.updatedImports} import(s))`
      );
      if (this.config.verbose) {
        for (const change of result.changes) {
          console.log(
            `  Line ${change.line}: "${change.from}" \u2192 "${change.to}"`
          );
        }
      }
    }
    const totalUpdates = results.reduce(
      (sum, result) => sum + result.updatedImports,
      0
    );
    console.log(
      `
\u2705 ${actionText.toLowerCase()} successfully! Updated ${totalUpdates} import(s) across ${results.length} file(s).`
    );
  }
};

// src/cli.ts
function containsGlobPattern(path) {
  return /[*?[\]{}]/.test(path);
}
var DEFAULT_ALIASES = [
  { alias: "@", path: "." },
  { alias: "~", path: "." }
];
var DEFAULT_EXTENSIONS = [".vue", ".ts", ".tsx", ".js"];
program.name("vue-refactorer").description(
  "A modern CLI tool for moving files and directories while automatically updating all import references in Vue.js, TypeScript, and JavaScript projects"
).version("1.0.0");
program.command("move <sources...>").description(
  "Move files/directories and update import references. Supports multiple source files or glob patterns (e.g., 'src/*.vue', 'components/*', 'utils/**/*.ts'). Last argument is the destination."
).option("-r, --root <path>", "Root directory to scan from", process.cwd()).option(
  "-a, --alias <alias:path>",
  "Path alias mapping (e.g., @:./src)",
  collectAliases,
  []
).option(
  "-e, --extensions <extensions>",
  "File extensions to process (comma-separated)",
  (value) => value.split(",").map((ext) => ext.startsWith(".") ? ext : "." + ext),
  DEFAULT_EXTENSIONS
).option("--no-gitignore", "Do not respect .gitignore files").option(
  "-d, --dry-run",
  "Show what would be moved without actually moving files"
).option("-v, --verbose", "Enable verbose output").action(async (sources, options, command) => {
  try {
    const rootDir = resolve4(options.root);
    if (sources.length < 2) {
      console.error(
        "\u274C Error: Need at least one source and one destination."
      );
      console.error(
        "   Usage: vue-refactorer move <source1> [source2] ... <destination>"
      );
      process.exit(1);
    }
    const destination = sources[sources.length - 1];
    const sourcePaths = sources.slice(0, -1);
    if (options.verbose) {
      console.log("Debug - Raw CLI arguments:");
      console.log("  Source arguments:", sourcePaths);
      console.log("  Destination argument:", destination);
      console.log("  Process argv:", process.argv);
    }
    const destinationPath = resolve4(rootDir, destination);
    const config = {
      rootDir,
      aliases: options.alias.length > 0 ? options.alias : DEFAULT_ALIASES.map((alias) => ({
        ...alias,
        path: rootDir
      })),
      fileExtensions: options.extensions,
      respectGitignore: options.gitignore !== false,
      dryRun: options.dryRun || false,
      verbose: options.verbose || false
    };
    if (config.verbose) {
      console.log("Configuration:");
      console.log("  Root directory:", config.rootDir);
      console.log("  Sources:", sourcePaths);
      console.log("  Destination:", destinationPath);
      console.log("  Aliases:", config.aliases);
      console.log("  Extensions:", config.fileExtensions);
      console.log("  Respect .gitignore:", config.respectGitignore);
      console.log("  Dry run:", config.dryRun);
      console.log();
    }
    const fileMover = new FileMover(config);
    for (const source of sourcePaths) {
      const hasGlobPattern = containsGlobPattern(source);
      const sourcePath = hasGlobPattern ? source : resolve4(rootDir, source);
      if (config.verbose) {
        console.log(
          `Processing source: ${sourcePath} (glob pattern: ${hasGlobPattern})`
        );
      }
      await fileMover.move(sourcePath, destinationPath, hasGlobPattern);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
});
program.command("scan").description("Scan directory and show all files and their imports").option("-r, --root <path>", "Root directory to scan from", process.cwd()).option(
  "-a, --alias <alias:path>",
  "Path alias mapping (e.g., @:./src)",
  collectAliases,
  []
).option(
  "-e, --extensions <extensions>",
  "File extensions to process (comma-separated)",
  (value) => value.split(",").map((ext) => ext.startsWith(".") ? ext : "." + ext),
  DEFAULT_EXTENSIONS
).option("--no-gitignore", "Do not respect .gitignore files").option("-v, --verbose", "Enable verbose output").action(async (options) => {
  try {
    const rootDir = resolve4(options.root);
    const config = {
      rootDir,
      aliases: options.alias.length > 0 ? options.alias : DEFAULT_ALIASES.map((alias) => ({
        ...alias,
        path: rootDir
      })),
      fileExtensions: options.extensions,
      respectGitignore: options.gitignore !== false,
      dryRun: true,
      // Always dry run for scan
      verbose: options.verbose || false
    };
    const fileMover = new FileMover(config);
    await fileMover.scan();
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
});
function collectAliases(value, previous) {
  const [alias, path] = value.split(":");
  if (!alias || !path) {
    throw new Error(`Invalid alias format: ${value}. Use format "alias:path"`);
  }
  return [...previous, { alias, path: resolve4(path) }];
}
program.parse();
