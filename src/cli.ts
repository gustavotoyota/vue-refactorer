import { program } from "commander";
import { resolve } from "path";
import { FileMover } from "./file-mover";
import type { CliConfig, PathAliasConfig } from "./types";

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

const DEFAULT_ALIASES: PathAliasConfig[] = [
  { alias: "@", path: "." },
  { alias: "~", path: "." },
];

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
    "Move files/directories and update import references. Supports multiple source files or glob patterns (e.g., 'src/*.vue', 'components/*', 'utils/**/*.ts'). Last argument is the destination."
  )
  .option("-r, --root <path>", "Root directory to scan from", process.cwd())
  .option(
    "-a, --alias <alias:path>",
    "Path alias mapping (e.g., @:./src)",
    collectAliases,
    []
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
  .action(async (sources: string[], options, command) => {
    try {
      const rootDir = resolve(options.root);

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

      if (options.verbose) {
        console.log("Debug - Raw CLI arguments:");
        console.log("  Source arguments:", sourcePaths);
        console.log("  Destination argument:", destination);
        console.log("  Process argv:", process.argv);
        console.log("  Process cwd:", normalizePath(process.cwd()));
        console.log("  Options root:", options.root);
        console.log("  Resolved rootDir:", normalizePath(rootDir));
      }

      const destinationPath = resolve(rootDir, destination);

      const config: CliConfig = {
        rootDir,
        aliases:
          options.alias.length > 0
            ? options.alias
            : DEFAULT_ALIASES.map((alias) => ({
                ...alias,
                path: rootDir,
              })),
        fileExtensions: options.extensions,
        respectGitignore: options.gitignore !== false,
        dryRun: options.dryRun || false,
        verbose: options.verbose || false,
      };

      if (config.verbose) {
        console.log("Configuration:");
        console.log("  Root directory:", normalizePath(config.rootDir));
        console.log("  Sources:", sourcePaths);
        console.log("  Destination:", normalizePath(destinationPath));
        console.log(
          "  Aliases:",
          config.aliases.map((a) => ({ ...a, path: normalizePath(a.path) }))
        );
        console.log("  Extensions:", config.fileExtensions);
        console.log("  Respect .gitignore:", config.respectGitignore);
        console.log("  Dry run:", config.dryRun);
        console.log();
      }

      const fileMover = new FileMover(config);

      // Handle multiple sources
      for (const source of sourcePaths) {
        // Check if source contains glob patterns
        const hasGlobPattern = containsGlobPattern(source);

        const sourcePath = hasGlobPattern
          ? source // Keep as relative pattern
          : resolve(rootDir, source);

        if (config.verbose) {
          console.log(
            `Processing source: ${normalizePath(
              sourcePath
            )} (glob pattern: ${hasGlobPattern})`
          );
          console.log(`  Original source: ${source}`);
          console.log(`  Root directory: ${normalizePath(rootDir)}`);
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
  .description("Scan directory and show all files and their imports")
  .option("-r, --root <path>", "Root directory to scan from", process.cwd())
  .option(
    "-a, --alias <alias:path>",
    "Path alias mapping (e.g., @:./src)",
    collectAliases,
    []
  )
  .option(
    "-e, --extensions <extensions>",
    "File extensions to process (comma-separated)",
    (value) =>
      value.split(",").map((ext) => (ext.startsWith(".") ? ext : "." + ext)),
    DEFAULT_EXTENSIONS
  )
  .option("--no-gitignore", "Do not respect .gitignore files")
  .option("-v, --verbose", "Enable verbose output")
  .action(async (options) => {
    try {
      const rootDir = resolve(options.root);

      const config: CliConfig = {
        rootDir,
        aliases:
          options.alias.length > 0
            ? options.alias
            : DEFAULT_ALIASES.map((alias) => ({
                ...alias,
                path: rootDir,
              })),
        fileExtensions: options.extensions,
        respectGitignore: options.gitignore !== false,
        dryRun: true, // Always dry run for scan
        verbose: options.verbose || false,
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

function collectAliases(
  value: string,
  previous: PathAliasConfig[]
): PathAliasConfig[] {
  const [alias, path] = value.split(":");
  if (!alias || !path) {
    throw new Error(`Invalid alias format: ${value}. Use format "alias:path"`);
  }
  return [...previous, { alias, path: resolve(path) }];
}

program.parse();
