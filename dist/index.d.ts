interface ImportInfo {
    /** The original import statement */
    original: string;
    /** The imported path (could be relative or absolute) */
    path: string;
    /** Start position in the file */
    start: number;
    /** End position in the file */
    end: number;
    /** Type of import (static or dynamic) */
    type: "static" | "dynamic";
    /** Line number where the import is found */
    line: number;
}
interface FileInfo {
    /** Absolute path to the file */
    absolutePath: string;
    /** Relative path from the project root */
    relativePath: string;
    /** File extension */
    extension: string;
    /** File content */
    content: string;
    /** List of imports found in this file */
    imports: ImportInfo[];
}
interface MoveOperation {
    /** Source path (absolute) */
    from: string;
    /** Destination path (absolute) */
    to: string;
    /** Whether this is a directory move */
    isDirectory: boolean;
}
interface PathAliasConfig {
    /** The alias symbol (e.g., '@', '~') */
    alias: string;
    /** The path it resolves to */
    path: string;
}
interface CliConfig {
    /** Root directory to scan from */
    rootDir: string;
    /** Path aliases configuration */
    aliases: PathAliasConfig[];
    /** File extensions to process */
    fileExtensions: string[];
    /** Whether to respect .gitignore */
    respectGitignore: boolean;
    /** Dry run mode (don't actually move files) */
    dryRun: boolean;
    /** Verbose output */
    verbose: boolean;
}
interface UpdateResult {
    /** Path of the updated file */
    filePath: string;
    /** Number of imports updated */
    updatedImports: number;
    /** List of changes made */
    changes: Array<{
        line: number;
        from: string;
        to: string;
    }>;
}

declare class FileDiscovery {
    private config;
    private ignoreFilter?;
    constructor(config: CliConfig);
    /**
     * Initialize the ignore filter by reading .gitignore files
     */
    private initializeIgnoreFilter;
    /**
     * Find all files in the project matching the configured extensions
     */
    findAllFiles(): Promise<FileInfo[]>;
    /**
     * Check if a path should be ignored based on .gitignore rules
     */
    isIgnored(filePath: string): boolean;
    /**
     * Find files that might be affected by moving a specific file or directory
     */
    findAffectedFiles(movePath: string): Promise<FileInfo[]>;
}

declare class FileMover {
    private config;
    private fileDiscovery;
    private importParser;
    private pathResolver;
    constructor(config: CliConfig);
    /**
     * Move a file or directory and update all import references
     */
    move(sourcePath: string, destinationPath: string, useGlobPattern?: boolean): Promise<void>;
    /**
     * Scan directory and show all files and their imports (for debugging)
     */
    scan(): Promise<void>;
    /**
     * Parse imports for all files
     */
    private parseImportsForFiles;
    /**
     * Find files that need import updates
     */
    private findFilesToUpdate;
    /**
     * Check if a file needs import updates
     */
    private fileNeedsUpdate;
    /**
     * Check if a path is affected by the move operation
     */
    private isPathAffectedByMove;
    /**
     * Update import references in files
     */
    private updateImportReferences;
    /**
     * Update imports in a single file
     */
    private updateFileImports;
    /**
     * Get the new path after a move operation
     */
    private getNewPathAfterMove;
    /**
     * Actually perform the file/directory move
     */
    private performMove;
    /**
     * Move a directory, handling the case where destination exists
     */
    private moveDirectory;
    /**
     * Merge contents of source directory into destination directory
     */
    private mergeDirectories;
    /**
     * Ensure a directory exists
     */
    private ensureDirectoryExists;
    /**
     * Move files matching a glob pattern to the destination directory
     */
    private moveGlobPattern;
    /**
     * Calculate the destination path for an item matched by a glob pattern
     * Rule: For glob patterns, destination is always treated as a folder
     */
    private calculateGlobDestination;
    /**
     * Extract the base directory from a glob pattern
     */
    private getGlobBase;
    /**
     * Move all contents of a directory to the destination directory
     */
    private moveDirectoryContents;
    /**
     * Report the results of the move operation
     */
    private reportResults;
}

declare class ImportParser {
    /**
     * Parse imports from a file based on its extension
     */
    parseImports(file: FileInfo): ImportInfo[];
    /**
     * Parse imports from a Vue single-file component
     */
    private parseVueFile;
    /**
     * Extract script blocks from Vue SFC
     */
    private extractVueScriptBlocks;
    /**
     * Parse Vue template for dynamic imports (though less common)
     */
    private parseVueTemplate;
    /**
     * Parse imports from JavaScript/TypeScript files
     */
    private parseJsFile;
    /**
     * Parse static ES6 import statements
     */
    private parseStaticImports;
    /**
     * Parse dynamic import() statements
     */
    private parseDynamicImports;
    /**
     * Parse require() statements (CommonJS)
     */
    private parseRequireStatements;
    /**
     * Update file content with new import paths
     */
    updateImportsInContent(content: string, updates: Array<{
        from: ImportInfo;
        to: string;
    }>): string;
    /**
     * Escape special regex characters in a string
     */
    private escapeRegex;
}

declare class PathResolver {
    private config;
    constructor(config: CliConfig);
    /**
     * Resolve an import path to an absolute path
     */
    resolveImportPath(importPath: string, fromFile: string): string | null;
    /**
     * Resolve alias paths like @/components or ~/utils
     */
    private resolveAliasPath;
    /**
     * Find the actual file path, trying different extensions if needed
     */
    private findActualFile;
    /**
     * Calculate new import path when a file is moved
     */
    calculateNewImportPath(originalImportPath: string, fromFile: string, movedFromPath: string, movedToPath: string, newFromFile?: string): string | null;
    /**
     * Check if a path is affected by a move operation
     */
    private isPathAffectedByMove;
    /**
     * Get the new path after a move operation
     */
    private getNewPathAfterMove;
    /**
     * Calculate the appropriate import path (relative, alias, or absolute)
     */
    private calculateRelativeImportPath;
    /**
     * Check if an import path uses an alias
     */
    private isAliasImport;
    /**
     * Try to convert an absolute path to an alias path
     */
    private tryConvertToAliasPath;
    /**
     * Get the original alias used in an import path
     */
    private getOriginalAlias;
    /**
     * Try to convert an absolute path to a specific alias path
     */
    private tryConvertToSpecificAliasPath;
    /**
     * Preserve the extension behavior from the original import path
     */
    private preserveExtensionBehavior;
    /**
     * Check if two files are the same (accounting for different extensions)
     */
    isSameFile(path1: string, path2: string): boolean;
}

export { type CliConfig, FileDiscovery, type FileInfo, FileMover, type ImportInfo, ImportParser, type MoveOperation, type PathAliasConfig, PathResolver, type UpdateResult };
