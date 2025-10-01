export interface ImportInfo {
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

export interface FileInfo {
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

export interface MoveOperation {
  /** Source path (absolute) */
  from: string;
  /** Destination path (absolute) */
  to: string;
  /** Whether this is a directory move */
  isDirectory: boolean;
}

export interface PathAliasConfig {
  /** The alias symbol (e.g., '@', '~') */
  alias: string;
  /** The path it resolves to */
  path: string;
}

export interface CliConfig {
  /** Root directory to scan from */
  rootDir: string;
  /** File extensions to process */
  fileExtensions: string[];
  /** Whether to respect .gitignore */
  respectGitignore: boolean;
  /** Dry run mode (don't actually move files) */
  dryRun: boolean;
  /** Verbose output */
  verbose: boolean;
  /** Search in whole repository (workspace mode) */
  workspace: boolean;
  /** Repository root (only used when workspace is true) */
  workspaceRoot: string | undefined;
}

export interface UpdateResult {
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
