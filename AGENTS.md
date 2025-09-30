# Vue Refactorer - Context Documentation

## Project Overview

Vue Refactorer is a modern CLI tool for moving files and directories in Vue.js, TypeScript, and JavaScript projects while automatically updating all import references. It's designed to handle complex refactoring scenarios with intelligent path resolution and import updating.

## Architecture

### Core Components

1. **CLI Interface** (`src/cli.ts`)

   - Built with Commander.js for command-line argument parsing
   - Supports two main commands: `move` and `scan`
   - Handles glob patterns, multiple sources, and various options
   - Auto-detects project root by looking for common markers (package.json, tsconfig.json, .git, etc.)

2. **File Discovery** (`src/file-discovery.ts`)

   - Scans project directories for relevant files
   - Respects `.gitignore` files
   - Supports configurable file extensions
   - Uses `globby` for pattern matching

3. **Import Parser** (`src/import-parser.ts`)

   - Parses imports from Vue SFC, TypeScript, and JavaScript files
   - Handles static imports, dynamic imports, and require statements
   - Supports Vue single-file components with script blocks
   - Updates import statements in file content

4. **Path Resolver** (`src/path-resolver.ts`)

   - Resolves import paths to absolute paths
   - Handles path aliases using tsconfig/jsconfig paths
   - Calculates new import paths after file moves
   - Maintains extension behavior and alias preferences

5. **TypeScript Config Resolver** (`src/tsconfig-resolver.ts`)

   - Auto-detects and parses tsconfig.json/jsconfig.json
   - Extracts path aliases from the compilerOptions.paths field
   - Handles extends configurations
   - Provides path alias mappings to other components

6. **File Mover** (`src/file-mover.ts`)
   - Orchestrates the entire move operation
   - Handles both single files and directories
   - Supports glob patterns and multiple sources for bulk operations
   - Manages directory merging and conflict resolution

## Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript with strict configuration
- **Package Manager**: Bun (not npm/yarn)
- **Testing**: Vitest (use `bun run test`, not `bun test`)
- **Build Tool**: tsup for bundling
- **CLI Framework**: Commander.js
- **File Operations**: Node.js fs/promises
- **Pattern Matching**: globby
- **Git Integration**: ignore package for .gitignore support

## Key Features

### Import Types Supported

- ES6 static imports (`import ... from '...'`)
- Dynamic imports (`import('...')`)
- CommonJS requires (`require('...')`)
- TypeScript type imports (`import type ... from '...'`)
- Vue SFC script blocks (both `<script>` and `<script setup>`)

### File Types Processed

- `.vue` (Vue Single File Components)
- `.ts` (TypeScript)
- `.tsx` (TypeScript React)
- `.js` (JavaScript)
- `.jsx` (JavaScript React)

### Path Resolution

- Relative imports (`./component`, `../utils`)
- Path aliases (`@/components`, `~/utils`)
- Absolute imports (rare, but supported)
- Extension handling (preserves original behavior)
- Index file resolution (`./folder` → `./folder/index.ts`)

### Move Operations

- Single file moves
- Multiple source moves (`vue-refactorer move file1.vue file2.vue destination/`)
- Directory moves (with content merging)
- Glob pattern moves (`src/*.vue`, `components/**/*.ts`)
- Directory content moves (`src/components/*`)

## Configuration

### Default Settings

```typescript
const DEFAULT_EXTENSIONS = [".vue", ".ts", ".tsx", ".js"];
```

Path aliases are automatically detected from your project's `tsconfig.json` or `jsconfig.json` files. The tool reads the `compilerOptions.paths` field and uses those mappings for path resolution.

### CLI Options

#### Move Command

- `--root <path>` / `-r <path>`: Project root directory (auto-detected if not provided)
- `--extensions <extensions>` / `-e <extensions>`: File extensions to process (comma-separated)
- `--no-gitignore`: Disable .gitignore respect
- `--dry-run` / `-d`: Preview changes without executing
- `--verbose` / `-v`: Detailed logging output

#### Scan Command

- `--root <path>` / `-r <path>`: Project root directory (auto-detected if not provided)
- `--extensions <extensions>` / `-e <extensions>`: File extensions to process (comma-separated)
- `--no-gitignore`: Disable .gitignore respect
- `--verbose` / `-v`: Detailed logging output

## Development Workflow

### Scripts

- `bun run build`: Build the project with tsup
- `bun run dev`: Watch mode for development
- `bun run test`: Run tests with Vitest
- `bun run test:watch`: Watch mode for tests
- `bun run prepublishOnly`: Build and test before publish
- `bun run release`: Version bump and publish

### Testing Strategy

- Unit tests for each core component
- Test files use `.test.ts` extension
- Vitest configuration includes coverage reporting
- CLI entry point is excluded from coverage (harder to unit test)

### Build Configuration

- Two separate builds: CLI (with shebang) and library (without)
- ESM format only
- TypeScript declarations generated
- Node.js 18+ target
- No minification (CLI tool, not web bundle)

## Important Notes

### Package Management

- **Always use Bun**, not npm/yarn/pnpm
- Use `bun run test` for testing, not `bun test`
- Dependencies are managed in `bun.lock`

### Code Style

- Strict TypeScript configuration with `noUncheckedIndexedAccess`
- Prefer explicit error handling over silent failures
- Use async/await consistently
- Follow functional programming patterns where possible

### File Operations

- Always check file existence before operations
- Handle directory merging gracefully
- Preserve original import extension behavior
- Respect .gitignore by default

### Error Handling

- Provide clear error messages with context
- Use proper exit codes for CLI operations
- Log warnings for non-fatal issues
- Continue processing other files when individual operations fail

### Performance Considerations

- Process files in parallel where possible
- Cache file discovery results
- Minimize file system operations
- Use streaming for large files if needed

## Common Patterns

### Adding New File Types

1. Update `DEFAULT_EXTENSIONS` in `cli.ts`
2. Add parsing logic in `ImportParser.parseImports()`
3. Add tests for the new file type

### Adding New Import Types

1. Add regex patterns in `ImportParser`
2. Update `ImportInfo` type if needed
3. Test with various import formats

### Extending Path Resolution

1. Modify `PathResolver` methods
2. Update `TsConfigResolver` for alias detection logic
3. Add tests for edge cases

### Working with TypeScript Config

1. `TsConfigResolver` handles auto-detection of tsconfig.json/jsconfig.json
2. Parses `compilerOptions.paths` for path aliases
3. Supports `extends` configurations
4. Path aliases are relative to the `baseUrl` or config file location

## Testing Guidelines

- Test files should be in the same directory as source files
- Use descriptive test names that explain the scenario
- Test both success and failure cases
- Mock file system operations when testing logic
- Use real file operations for integration tests

## Release Process

1. Use `bun run release` for automated versioning and publishing
2. The tool is published to npm as `vue-refactorer`

This documentation should provide sufficient context to understand the project structure, development practices, and key implementation details.
