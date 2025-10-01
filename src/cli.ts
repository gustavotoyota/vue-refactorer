import { program } from "commander";
import { existsSync } from "fs";
import { resolve, join } from "path";
import { FileMover } from "./file-mover";
import { TsConfigResolver } from "./tsconfig-resolver";
import type { CliConfig } from "./types";

/**
 * Normalize path separators to forward slashes for cross-platform compatibility
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Check if a path contains glob patterns
 */
function containsGlobPattern(path: string): boolean {
  return /[*?[\]{}]/.test(path);
}

/**
 * Get the actual working directory, accounting for npx behavior
 * npx changes the working directory to the nearest package.json, but sets INIT_CWD to the original directory
 */
function getActualWorkingDirectory(): string {
  // Use INIT_CWD if available (set by npm/npx to preserve original working directory)
  // Otherwise fall back to process.cwd()
  return process.env.INIT_CWD || process.cwd();
}

/**
 * Detect project root by looking for common markers
 */
function detectProjectRoot(providedRoot?: string): string {
  if (providedRoot) {
    return resolve(providedRoot);
  }

  // Start from actual working directory (accounts for npx behavior)
  let currentDir = getActualWorkingDirectory();

  // Walk up to find project markers
  const visited = new Set<string>();
  while (currentDir && !visited.has(currentDir)) {
    visited.add(currentDir);

    // Check for common project root markers
    const markers = [
      "package.json",
      "tsconfig.json",
      "jsconfig.json",
      ".git",
      "pnpm-workspace.yaml",
      "lerna.json",
      "turbo.json",
    ];

    for (const marker of markers) {
      if (existsSync(join(currentDir, marker))) {
        return currentDir;
      }
    }

    // Move to parent directory
    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) break; // Reached filesystem root
    currentDir = parentDir;
  }

  // Fallback to actual working directory
  return getActualWorkingDirectory();
}

/**
 * Find the repository root for workspace mode
 * Priority:
 * 1. First ancestor containing .git folder
 * 2. Last ancestor containing package.json
 */
function findRepositoryRoot(startDir: string, verbose: boolean = false): string {
  let currentDir = startDir;
  const visited = new Set<string>();
  let gitRoot: string | undefined;
  let lastPackageJsonDir: string | undefined;

  if (verbose) {
    console.log(`Finding repository root starting from: ${currentDir}`);
  }

  while (currentDir && !visited.has(currentDir)) {
    visited.add(currentDir);

    // Check for .git directory
    if (existsSync(join(currentDir, ".git"))) {
      gitRoot = currentDir;
      if (verbose) {
        console.log(`  Found .git directory at: ${gitRoot}`);
      }
      // Git root takes priority, return immediately
      return gitRoot;
    }

    // Track last package.json found
    if (existsSync(join(currentDir, "package.json"))) {
      lastPackageJsonDir = currentDir;
      if (verbose) {
        console.log(`  Found package.json at: ${lastPackageJsonDir}`);
      }
    }

    // Move to parent directory
    const parentDir = resolve(currentDir, "..");
    if (parentDir === currentDir) break; // Reached filesystem root
    currentDir = parentDir;
  }

  // If no .git found, use the last package.json directory
  if (lastPackageJsonDir) {
    if (verbose) {
      console.log(`  Using last package.json directory as repository root: ${lastPackageJsonDir}`);
    }
    return lastPackageJsonDir;
  }

  // Fallback to start directory
  if (verbose) {
    console.log(`  No .git or package.json found, using start directory: ${startDir}`);
  }
  return startDir;
}

const DEFAULT_EXTENSIONS = [".vue", ".ts", ".tsx", ".js"];

program
  .name("vue-refactorer")
  .description(
    "A modern CLI tool for moving files and directories while automatically updating all import references in Vue.js, TypeScript, and JavaScript projects"
  )
  .version("1.0.0");

program
  .command("move <sources...>")
  .description(
    "Move files/directories and update import references. Supports multiple source files or glob patterns (e.g., 'src/*.vue', 'components/*', 'utils/**/*.ts'). Last argument is the destination. Path aliases are automatically detected from tsconfig.json/jsconfig.json."
  )
  .option(
    "-r, --root <path>",
    "Root directory (auto-detected if not provided)"
  )
  .option(
    "-e, --extensions <extensions>",
    "File extensions to process (comma-separated)",
    (value) =>
      value.split(",").map((ext) => (ext.startsWith(".") ? ext : "." + ext)),
    DEFAULT_EXTENSIONS
  )
  .option("--no-gitignore", "Do not respect .gitignore files")
  .option(
    "-d, --dry-run",
    "Show what would be moved without actually moving files"
  )
  .option("-v, --verbose", "Enable verbose output")
  .option(
    "-w, --workspace",
    "Search for imports in the whole repository (git root or last package.json ancestor)"
  )
  .action(async (sources: string[], options, command) => {
    try {
      const rootDir = detectProjectRoot(options.root);

      // Validate that we have at least 2 arguments (source + destination)
      if (sources.length < 2) {
        console.error(
          "❌ Error: Need at least one source and one destination."
        );
        console.error(
          "   Usage: vue-refactorer move <source1> [source2] ... <destination>"
        );
        process.exit(1);
      }

      // Last argument is destination, all others are sources
      const destination = sources[sources.length - 1]!; // Safe because we validated length >= 2
      const sourcePaths = sources.slice(0, -1);

      // Determine workspace root if workspace mode is enabled
      const workspaceEnabled = options.workspace === true;
      const workspaceRoot = workspaceEnabled
        ? findRepositoryRoot(rootDir, options.verbose || false)
        : undefined;

      if (options.verbose) {
        console.log("Debug - Raw CLI arguments:");
        console.log("  Source arguments:", sourcePaths);
        console.log("  Destination argument:", destination);
        console.log("  Process argv:", process.argv);
        console.log("  Process cwd:", normalizePath(process.cwd()));
        console.log("  Actual working directory:", normalizePath(getActualWorkingDirectory()));
        console.log("  INIT_CWD:", process.env.INIT_CWD || "(not set)");
        console.log("  Options root:", options.root);
        console.log("  Detected project root:", normalizePath(rootDir));
        if (workspaceEnabled && workspaceRoot) {
          console.log("  Workspace mode enabled");
          console.log("  Repository root:", normalizePath(workspaceRoot));
        }
      }

      // Resolve paths relative to actual working directory, not project root
      const destinationPath = resolve(getActualWorkingDirectory(), destination);

      const config: CliConfig = {
        rootDir,
        fileExtensions: options.extensions,
        respectGitignore: options.gitignore !== false,
        dryRun: options.dryRun || false,
        verbose: options.verbose || false,
        workspace: workspaceEnabled,
        workspaceRoot,
      };

      if (config.verbose) {
        console.log("Configuration:");
        console.log("  Project root (for configs):", normalizePath(config.rootDir));
        console.log("  Current working directory:", normalizePath(process.cwd()));
        console.log("  Actual working directory:", normalizePath(getActualWorkingDirectory()));
        if (config.workspace && config.workspaceRoot) {
          console.log("  Workspace mode: enabled");
          console.log("  Repository root (search scope):", normalizePath(config.workspaceRoot));
        }
        console.log("  Sources:", sourcePaths);
        console.log("  Destination:", normalizePath(destinationPath));
        console.log("  Extensions:", config.fileExtensions);
        console.log("  Respect .gitignore:", config.respectGitignore);
        console.log("  Dry run:", config.dryRun);
        console.log("  Aliases: Auto-detected from tsconfig.json/jsconfig.json");
        console.log();
      }

      // Initialize TsConfigResolver
      const tsConfigResolver = new TsConfigResolver(rootDir, config.verbose);
      const fileMover = new FileMover(config, tsConfigResolver);

      // Handle multiple sources
      for (const source of sourcePaths) {
        // Check if source contains glob patterns
        const hasGlobPattern = containsGlobPattern(source);

        // Resolve paths relative to actual working directory, not project root
        const sourcePath = hasGlobPattern
          ? source // Keep as relative pattern for globby
          : resolve(getActualWorkingDirectory(), source);

        if (config.verbose) {
          console.log(
            `Processing source: ${normalizePath(
              sourcePath
            )} (glob pattern: ${hasGlobPattern})`
          );
          console.log(`  Original source argument: ${source}`);
          console.log(`  Current working directory: ${normalizePath(process.cwd())}`);
          console.log(`  Actual working directory: ${normalizePath(getActualWorkingDirectory())}`);
          console.log(`  Project root (for configs): ${normalizePath(rootDir)}`);
          console.log(`  Resolved source path: ${normalizePath(sourcePath)}`);
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

program
  .command("scan")
  .description(
    "Scan directory and show all files and their imports. Path aliases are automatically detected from tsconfig.json/jsconfig.json."
  )
  .option(
    "-r, --root <path>",
    "Root directory (auto-detected if not provided)"
  )
  .option(
    "-e, --extensions <extensions>",
    "File extensions to process (comma-separated)",
    (value) =>
      value.split(",").map((ext) => (ext.startsWith(".") ? ext : "." + ext)),
    DEFAULT_EXTENSIONS
  )
  .option(
    "-f, --file <path>",
    "Scan a specific file only (relative to current directory or absolute)"
  )
  .option("--no-gitignore", "Do not respect .gitignore files")
  .option("-v, --verbose", "Enable verbose output")
  .option(
    "-w, --workspace",
    "Search for imports in the whole repository (git root or last package.json ancestor)"
  )
  .action(async (options) => {
    try {
      const rootDir = detectProjectRoot(options.root);

      // Determine workspace root if workspace mode is enabled
      const workspaceEnabled = options.workspace === true;
      const workspaceRoot = workspaceEnabled
        ? findRepositoryRoot(rootDir, options.verbose || false)
        : undefined;

      const config: CliConfig = {
        rootDir,
        fileExtensions: options.extensions,
        respectGitignore: options.gitignore !== false,
        dryRun: true, // Always dry run for scan
        verbose: options.file ? true : (options.verbose || false), // Always verbose when scanning single file
        workspace: workspaceEnabled,
        workspaceRoot,
      };

      // Initialize TsConfigResolver
      const tsConfigResolver = new TsConfigResolver(rootDir, config.verbose);
      const fileMover = new FileMover(config, tsConfigResolver);

      if (options.file) {
        // Scan a specific file (always verbose for detailed debugging)
        const targetFile = resolve(getActualWorkingDirectory(), options.file);
        await fileMover.scanFile(targetFile);
      } else {
        // Scan all files
        await fileMover.scan();
      }
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program.parse();
