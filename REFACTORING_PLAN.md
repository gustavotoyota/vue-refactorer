# Vue Refactorer - Automatic Alias Detection & Monorepo Support Plan

## Executive Summary

This document outlines the refactoring plan to transform vue-refactorer from a tool with manual alias configuration to one with automatic, reliable alias detection that works seamlessly in monorepo environments. The changes will make the tool more intelligent, user-friendly, and robust while maintaining or improving performance.

## Current State Analysis

### Existing Architecture

1. **Alias Configuration**: Manual and global

   - Hardcoded defaults: `@` → `.`, `~` → `.`
   - CLI option: `--alias @:./src`
   - Single set of aliases per execution
   - Assumes all files use same aliases

2. **Path Resolution**: Global resolver

   - `PathResolver` instantiated once with single config
   - Same alias mappings used for all files
   - Works only if working directory matches alias paths

3. **Project Structure Assumptions**:

   - Single project per execution
   - Single root directory
   - Single tsconfig (implicitly)
   - No monorepo awareness

4. **Working Directory Dependency**:
   - Uses `process.cwd()` as default root
   - Aliases point to rootDir by default
   - Breaks when run from different directories

### Current Limitations

1. **Incorrect Alias Resolution**: If user runs tool from parent directory, aliases won't resolve correctly
2. **No Monorepo Support**: Can't handle projects with different tsconfig files and different path aliases
3. **Manual Configuration**: Users must specify aliases manually, error-prone
4. **Brittle**: Assumes specific project structure
5. **No TypeScript Integration**: Doesn't respect actual TypeScript configuration

## Desired State

### Goals

1. **Automatic Detection**: Zero configuration for aliases - read from tsconfig.json/jsconfig.json
2. **Monorepo Support**: Handle multiple projects with different tsconfigs in the same repository
3. **Location Independence**: Work correctly regardless of where the command is executed
4. **Performance**: Maintain or improve current performance with intelligent caching
5. **Reliability**: Handle edge cases (extends, references, missing configs) gracefully
6. **Simplicity**: Remove manual alias configuration, make codebase simpler

### Key Principles

1. **Per-file alias resolution**: Each file resolves aliases based on its nearest tsconfig.json
2. **Lazy evaluation**: Only parse tsconfig when needed
3. **Smart caching**: Cache parsed configs to avoid redundant I/O
4. **Graceful degradation**: Fall back to sensible defaults if no tsconfig found
5. **TypeScript compliance**: Follow TypeScript's module resolution algorithm

## Detailed Design

### 1. New Module: TsConfigResolver

**Purpose**: Discover, parse, and cache TypeScript/JavaScript configuration files.

**Responsibilities**:

- Find nearest tsconfig.json/jsconfig.json for any given file
- Parse tsconfig files including:
  - `compilerOptions.paths` (path aliases)
  - `compilerOptions.baseUrl`
  - `extends` (configuration inheritance)
  - `references` (project references for monorepos)
- Cache parsed configurations for performance
- Convert TypeScript paths to internal alias format

**Interface**:

```typescript
interface TsConfigInfo {
  configPath: string;
  baseUrl: string;
  paths: Record<string, string[]>;
  aliases: PathAliasConfig[];
  extends?: string;
  references?: string[];
}

class TsConfigResolver {
  // Find tsconfig for a specific file
  findConfigForFile(filePath: string): TsConfigInfo | null;

  // Get all tsconfigs in workspace (for monorepo)
  findAllConfigs(rootDir: string): TsConfigInfo[];

  // Parse a specific tsconfig file
  parseConfig(configPath: string): TsConfigInfo;

  // Clear cache (useful for tests)
  clearCache(): void;
}
```

**Implementation Details**:

1. **Config Discovery Algorithm**:

   ```
   For file at /path/to/project/src/components/Button.vue:
   1. Check /path/to/project/src/components/tsconfig.json
   2. Check /path/to/project/src/tsconfig.json
   3. Check /path/to/project/tsconfig.json ← Usually found here
   4. Check /path/to/tsconfig.json
   5. Stop at filesystem root or git root
   6. If not found, check for jsconfig.json using same algorithm
   7. If still not found, return null (no config)
   ```

2. **Parsing Strategy**:

   ```typescript
   // Parse with extends support
   function parseConfig(configPath: string): TsConfigInfo {
     const content = readFileSync(configPath, 'utf-8');
     const config = JSON.parse(stripJsonComments(content));

     // Handle extends
     let finalConfig = config;
     if (config.extends) {
       const parentPath = resolveConfigPath(config.extends, configPath);
       const parentConfig = parseConfig(parentPath);
       finalConfig = mergeConfigs(parentConfig, config);
     }

     // Extract aliases from paths
     const aliases = convertPathsToAliases(
       finalConfig.compilerOptions?.paths,
       finalConfig.compilerOptions?.baseUrl,
       dirname(configPath)
     );

     return { configPath, baseUrl, paths, aliases, ... };
   }
   ```

3. **Caching Strategy**:

   ```typescript
   class TsConfigResolver {
     private configCache = new Map<string, TsConfigInfo | null>();
     private fileToConfigCache = new Map<string, string | null>();

     findConfigForFile(filePath: string): TsConfigInfo | null {
       // Check file-to-config cache
       if (this.fileToConfigCache.has(filePath)) {
         const configPath = this.fileToConfigCache.get(filePath);
         if (!configPath) return null;
         return this.configCache.get(configPath) || null;
       }

       // Walk up directory tree
       const configPath = this.walkUpToFindConfig(filePath);

       // Cache the file-to-config mapping
       this.fileToConfigCache.set(filePath, configPath);

       if (!configPath) return null;

       // Check config cache
       if (!this.configCache.has(configPath)) {
         this.configCache.set(configPath, this.parseConfig(configPath));
       }

       return this.configCache.get(configPath) || null;
     }
   }
   ```

4. **Path to Alias Conversion**:

   ```typescript
   // Convert TypeScript paths to aliases
   // tsconfig.json:
   // {
   //   "compilerOptions": {
   //     "baseUrl": ".",
   //     "paths": {
   //       "@/*": ["./src/*"],
   //       "~/*": ["./src/*"],
   //       "@components/*": ["./src/components/*"]
   //     }
   //   }
   // }

   function convertPathsToAliases(
     paths: Record<string, string[]>,
     baseUrl: string,
     configDir: string
   ): PathAliasConfig[] {
     const aliases: PathAliasConfig[] = [];

     for (const [pattern, targets] of Object.entries(paths)) {
       // Remove /* suffix from pattern
       const alias = pattern.replace(/\/\*$/, "");

       // Use first target (TypeScript uses first match)
       const target = targets[0]?.replace(/\/\*$/, "") || "";

       // Resolve relative to baseUrl and config directory
       const absolutePath = resolve(configDir, baseUrl, target);

       aliases.push({ alias, path: absolutePath });
     }

     // Sort by specificity (longer aliases first)
     return aliases.sort((a, b) => b.alias.length - a.alias.length);
   }
   ```

5. **Comment Stripping** (for JSON with comments):
   ```typescript
   function stripJsonComments(json: string): string {
     return json.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
   }
   ```

### 2. Updated Module: PathResolver

**Changes**:

- Remove global config.aliases
- Add per-file alias resolution
- Integrate with TsConfigResolver
- Cache per-file alias lookups

**Updated Interface**:

```typescript
class PathResolver {
  private tsConfigResolver: TsConfigResolver;

  constructor(config: CliConfig, tsConfigResolver: TsConfigResolver);

  // Now context-aware - needs to know which file is resolving
  resolveImportPath(importPath: string, fromFile: string): string | null;

  // Updated to use per-file aliases
  calculateNewImportPath(
    originalImportPath: string,
    fromFile: string,
    movedFromPath: string,
    movedToPath: string,
    newFromFile?: string
  ): string | null;

  // New helper method
  private getAliasesForFile(filePath: string): PathAliasConfig[];
}
```

**Implementation Changes**:

```typescript
class PathResolver {
  private aliasCache = new Map<string, PathAliasConfig[]>();

  private getAliasesForFile(filePath: string): PathAliasConfig[] {
    // Check cache
    if (this.aliasCache.has(filePath)) {
      return this.aliasCache.get(filePath)!;
    }

    // Find tsconfig for this file
    const tsConfig = this.tsConfigResolver.findConfigForFile(filePath);

    // Use aliases from tsconfig, or empty array if no config
    const aliases = tsConfig?.aliases || [];

    // Cache for this file
    this.aliasCache.set(filePath, aliases);

    return aliases;
  }

  private resolveAliasPath(
    importPath: string,
    fromFile: string // NEW: needed for context
  ): string | null {
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
}
```

### 3. Updated Module: CliConfig

**Changes**:

- Remove `aliases` field (now internal/automatic)
- Add root detection options
- Simplify configuration

**Updated Interface**:

```typescript
interface CliConfig {
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
  // REMOVED: aliases: PathAliasConfig[];
}
```

### 4. Updated Module: CLI

**Changes**:

- Remove `--alias` option
- Auto-detect project root intelligently
- Add `--no-auto-alias` flag for edge cases

**Root Detection Algorithm**:

```typescript
function detectProjectRoot(providedRoot?: string): string {
  if (providedRoot) {
    return resolve(providedRoot);
  }

  // Start from current working directory
  let currentDir = process.cwd();

  // Walk up to find project markers
  while (currentDir) {
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

  // Fallback to current directory
  return process.cwd();
}
```

**Updated CLI**:

```typescript
program
  .command("move <sources...>")
  .description("Move files/directories and update import references...")
  .option("-r, --root <path>", "Root directory (auto-detected if not provided)")
  .option(
    "-e, --extensions <extensions>",
    "File extensions to process (comma-separated)",
    DEFAULT_EXTENSIONS
  )
  .option("--no-gitignore", "Do not respect .gitignore files")
  .option("-d, --dry-run", "Preview changes without executing")
  .option("-v, --verbose", "Enable verbose output")
  // REMOVED: .option("-a, --alias <alias:path>", ...)
  .action(async (sources: string[], options) => {
    const rootDir = detectProjectRoot(options.root);

    const config: CliConfig = {
      rootDir,
      fileExtensions: options.extensions,
      respectGitignore: options.gitignore !== false,
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
    };

    // Initialize with tsconfig resolver
    const tsConfigResolver = new TsConfigResolver(config);
    const fileMover = new FileMover(config, tsConfigResolver);

    // ... rest of implementation
  });
```

### 5. Updated Module: FileMover

**Changes**:

- Accept TsConfigResolver as dependency
- Pass it to PathResolver
- No other major changes needed

```typescript
export class FileMover {
  private config: CliConfig;
  private fileDiscovery: FileDiscovery;
  private importParser: ImportParser;
  private pathResolver: PathResolver;

  constructor(config: CliConfig, tsConfigResolver: TsConfigResolver) {
    this.config = config;
    this.fileDiscovery = new FileDiscovery(config);
    this.importParser = new ImportParser();
    this.pathResolver = new PathResolver(config, tsConfigResolver);
  }

  // ... rest unchanged
}
```

## Performance Considerations

### Caching Strategy

1. **TsConfig Caching**:

   - Cache parsed tsconfig.json files by absolute path
   - Cache file-to-config mappings
   - Clear cache only when needed (tests, or file system changes)

2. **Alias Caching**:

   - Cache aliases per file in PathResolver
   - Invalidate only affected files on move

3. **Lazy Loading**:
   - Only parse tsconfig when resolving imports
   - Don't scan all tsconfigs upfront
   - Parse on-demand as files are processed

### Performance Benchmarks

**Before** (current):

- Initial setup: ~10ms (load config)
- Per-file alias resolution: ~0.01ms (cached lookup)
- Total for 1000 files: ~10ms

**After** (with auto-detection):

- Initial setup: ~0ms (no upfront work)
- First alias resolution per file: ~5-10ms (find & parse tsconfig)
- Subsequent resolutions: ~0.01ms (cached)
- Worst case (100 different tsconfigs): ~500-1000ms one-time cost
- Typical case (1-5 tsconfigs): ~25-50ms one-time cost
- Total for 1000 files: ~50-100ms (acceptable)

### Optimization Techniques

1. **Parallel Processing**: Continue processing files in parallel
2. **Smart Cache Keys**: Use directory hashes for file-to-config mapping
3. **Batch Lookups**: Group files by directory before resolving
4. **Memory Management**: Clear caches after operation completes

## Edge Cases & Error Handling

### Edge Cases to Handle

1. **No tsconfig.json found**:

   - Solution: Continue with empty aliases, use relative imports only
   - Log warning if verbose mode enabled

2. **Circular extends**:

   - Solution: Track visited configs, throw error on cycle
   - Example: `tsconfig.a.json extends tsconfig.b.json extends tsconfig.a.json`

3. **Invalid JSON**:

   - Solution: Catch parse errors, log warning, skip that config
   - Continue processing with parent directory's config

4. **Relative extends**:

   - Solution: Resolve relative to config directory
   - Example: `"extends": "./tsconfig.base.json"`

5. **Package extends**:

   - Solution: Resolve through node_modules
   - Example: `"extends": "@tsconfig/node18/tsconfig.json"`

6. **Multiple path matches**:

   - Solution: Use first match (TypeScript behavior)
   - Sort aliases by specificity (longer first)

7. **Monorepo with project references**:

   - Solution: Each file uses its own tsconfig, references don't affect resolution
   - Track references for potential future optimizations

8. **Mixed tsconfig and jsconfig**:

   - Solution: Prefer tsconfig.json, fallback to jsconfig.json
   - Same directory: tsconfig.json wins

9. **Symlinks**:

   - Solution: Resolve symlinks to real paths before processing
   - Use `fs.realpathSync()` when needed

10. **Windows paths**:
    - Solution: Normalize all paths to forward slashes
    - Use existing `normalizePath()` function consistently

### Error Messages

1. **Circular extends**:

   ```
   ❌ Error: Circular extends detected in tsconfig.json:
      /path/to/tsconfig.a.json → tsconfig.b.json → tsconfig.a.json
   ```

2. **Invalid JSON**:

   ```
   ⚠️  Warning: Invalid JSON in /path/to/tsconfig.json:
      Unexpected token } in JSON at position 123
      Continuing without this configuration.
   ```

3. **Missing extended config**:
   ```
   ⚠️  Warning: Extended config not found:
      /path/to/tsconfig.json extends "./base.json"
      File not found: /path/to/base.json
   ```

## Testing Strategy

### Unit Tests

1. **TsConfigResolver Tests**:

   ```typescript
   describe("TsConfigResolver", () => {
     test("finds tsconfig in same directory");
     test("finds tsconfig in parent directory");
     test("finds jsconfig when no tsconfig");
     test("returns null when no config found");
     test("handles extends correctly");
     test("handles circular extends");
     test("converts paths to aliases correctly");
     test("caches parsed configs");
     test("handles baseUrl correctly");
     test("handles multiple path patterns");
     test("sorts aliases by specificity");
   });
   ```

2. **PathResolver Tests** (updated):

   ```typescript
   describe("PathResolver", () => {
     test("resolves aliases from file-specific tsconfig");
     test("uses different aliases for different projects");
     test("falls back to relative imports when no tsconfig");
     test("caches aliases per file");
     test("handles moved files with new tsconfig context");
   });
   ```

3. **Integration Tests**:
   ```typescript
   describe("FileMover with auto-detection", () => {
     test("works in monorepo with multiple tsconfigs");
     test("works without any tsconfig");
     test("works with extends");
     test("works when run from different directories");
     test("handles nested projects correctly");
   });
   ```

### Test Fixtures

Create test fixtures for common scenarios:

1. **Single Project**:

   ```
   project/
     tsconfig.json (baseUrl: ".", paths: { "@/*": ["./src/*"] })
     src/
       components/
         Button.vue
   ```

2. **Monorepo**:

   ```
   monorepo/
     packages/
       app-a/
         tsconfig.json (paths: { "@/*": ["./src/*"] })
         src/
       app-b/
         tsconfig.json (paths: { "~/*": ["./lib/*"] })
         lib/
   ```

3. **Extended Config**:
   ```
   project/
     tsconfig.base.json
     tsconfig.json (extends: "./tsconfig.base.json")
     src/
   ```

### Manual Testing Scenarios

1. Run from project root
2. Run from subdirectory
3. Run from parent directory
4. Run in monorepo
5. Run with no tsconfig
6. Run with complex extends chain

## Migration Strategy

### Backwards Compatibility

**Breaking Changes**:

- Remove `--alias` CLI option
- Change behavior when no tsconfig found (no default aliases)

**Version Strategy**:

- Major version bump: 1.x → 2.0.0
- Clear migration guide in release notes

### Migration Guide for Users

````markdown
# Migrating from 1.x to 2.0

## Breaking Changes

### Removed: --alias option

**Before (v1.x)**:

```bash
vue-refactorer move src/Button.vue src/components/ --alias @:./src
```
````

**After (v2.0)**:

```bash
vue-refactorer move src/Button.vue src/components/
# Aliases automatically detected from tsconfig.json
```

### Required: tsconfig.json or jsconfig.json

If you don't have a tsconfig.json, create one:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Changed: Default behavior without tsconfig

**Before**: Default aliases (@, ~) pointed to root directory
**After**: No default aliases, only relative imports work

If you relied on default aliases, add a tsconfig.json.

```

### Rollout Plan

1. **Phase 1** (Week 1-2): Implement TsConfigResolver
2. **Phase 2** (Week 2-3): Update PathResolver and FileMover
3. **Phase 3** (Week 3): Update CLI and tests
4. **Phase 4** (Week 4): Integration testing and bug fixes
5. **Phase 5** (Week 4): Documentation and examples
6. **Phase 6** (Week 5): Beta release for testing
7. **Phase 7** (Week 6): Final release

## Implementation Checklist

### Core Implementation

- [ ] Create `src/tsconfig-resolver.ts`
  - [ ] Implement `findConfigForFile()`
  - [ ] Implement `parseConfig()`
  - [ ] Implement `convertPathsToAliases()`
  - [ ] Implement caching
  - [ ] Handle `extends`
  - [ ] Handle JSON comments
  - [ ] Add error handling

- [ ] Update `src/path-resolver.ts`
  - [ ] Add `TsConfigResolver` dependency
  - [ ] Implement `getAliasesForFile()`
  - [ ] Update `resolveAliasPath()` to be context-aware
  - [ ] Add per-file alias caching
  - [ ] Update all methods to use new approach

- [ ] Update `src/types.ts`
  - [ ] Add `TsConfigInfo` interface
  - [ ] Remove `aliases` from `CliConfig`
  - [ ] Add new types as needed

- [ ] Update `src/cli.ts`
  - [ ] Remove `--alias` option
  - [ ] Remove `collectAliases()` function
  - [ ] Remove `DEFAULT_ALIASES`
  - [ ] Implement `detectProjectRoot()`
  - [ ] Update config creation
  - [ ] Pass `TsConfigResolver` to `FileMover`

- [ ] Update `src/file-mover.ts`
  - [ ] Accept `TsConfigResolver` in constructor
  - [ ] Pass to `PathResolver`

### Testing

- [ ] Create test fixtures
  - [ ] Single project fixture
  - [ ] Monorepo fixture
  - [ ] Extended config fixture
  - [ ] No config fixture

- [ ] Add `src/tsconfig-resolver.test.ts`
  - [ ] Test file discovery
  - [ ] Test config parsing
  - [ ] Test extends handling
  - [ ] Test caching
  - [ ] Test error cases

- [ ] Update `src/path-resolver.test.ts`
  - [ ] Update existing tests
  - [ ] Add multi-project tests
  - [ ] Add context-aware tests

- [ ] Add integration tests
  - [ ] Monorepo scenarios
  - [ ] Different working directories
  - [ ] Complex extends chains

### Documentation

- [ ] Update `README.md`
  - [ ] Remove alias configuration docs
  - [ ] Add auto-detection explanation
  - [ ] Add tsconfig.json examples
  - [ ] Add monorepo examples

- [ ] Update `AGENTS.md` (context doc)
  - [ ] Document new architecture
  - [ ] Update examples
  - [ ] Add TsConfigResolver info

- [ ] Create `MIGRATION.md`
  - [ ] Document breaking changes
  - [ ] Provide migration examples
  - [ ] FAQ section

- [ ] Update inline code comments
  - [ ] Add JSDoc for new functions
  - [ ] Update existing docs

### Release

- [ ] Update `package.json` version to 2.0.0
- [ ] Update `CHANGELOG.md`
- [ ] Create release notes
- [ ] Tag release
- [ ] Publish to npm

## Dependencies

### New Dependencies

Consider adding:
- `jsonc-parser`: For robust JSON-with-comments parsing (TypeScript standard)
  - Alternative: Simple regex-based stripping (lighter weight)

**Recommendation**: Start with simple regex-based comment stripping. If issues arise, add `jsonc-parser`.

### Existing Dependencies

No changes needed to existing dependencies.

## Risks & Mitigations

### Risk 1: Performance Regression

**Mitigation**:
- Aggressive caching
- Benchmark before/after
- Optimize hot paths
- Consider lazy loading strategies

### Risk 2: Breaking Users Without tsconfig

**Mitigation**:
- Clear error messages
- Migration guide
- Fallback to relative imports
- Consider optional legacy mode

### Risk 3: Complex tsconfig Edge Cases

**Mitigation**:
- Start with common cases
- Iterate based on user feedback
- Document unsupported scenarios
- Handle errors gracefully

### Risk 4: Monorepo Complexity

**Mitigation**:
- Test with real monorepo setups (nx, turborepo, lerna)
- Start simple, iterate
- Cache aggressively per project

## Success Metrics

### Functional Goals

- [ ] Works correctly with zero configuration
- [ ] Handles monorepos with multiple projects
- [ ] Works from any working directory
- [ ] Maintains or improves performance

### Quality Goals

- [ ] 100% test coverage for TsConfigResolver
- [ ] All existing tests pass
- [ ] No performance regression (< 10% slower)
- [ ] Clear error messages for edge cases

### User Experience Goals

- [ ] Simpler CLI (fewer options)
- [ ] No manual alias configuration needed
- [ ] Works "out of the box" for TypeScript projects
- [ ] Better error messages

## Future Enhancements

### Phase 2 Features (Post-2.0)

1. **Smart alias preservation**:
   - Analyze existing import patterns
   - Maintain same alias style after moves

2. **Cross-project refactoring**:
   - Move files between monorepo packages
   - Update imports in all packages

3. **IDE Integration**:
   - VS Code extension
   - Language server protocol support

4. **Configuration file**:
   - `.vue-refactorer.json` for project-specific settings
   - Override auto-detection if needed

5. **Import optimization**:
   - Suggest better import paths
   - Remove unused imports
   - Sort imports

## Conclusion

This refactoring will transform vue-refactorer into a truly intelligent tool that "just works" without manual configuration. The changes are significant but focused, with clear benefits:

- **Simpler UX**: No more alias configuration
- **More Reliable**: Uses actual TypeScript configuration
- **Monorepo Ready**: Works in complex project structures
- **Location Independent**: Run from anywhere
- **Future Proof**: Foundation for advanced features

The implementation is straightforward with clear steps and testable components. Performance impact should be minimal with proper caching, and the resulting codebase will actually be simpler than the current version.

**Estimated Timeline**: 4-6 weeks from start to release
**Estimated LOC**: +500 (new TsConfigResolver), -100 (removed manual config), Net: +400 LOC
**Risk Level**: Medium (significant changes, but well-defined scope)
**User Impact**: High (major usability improvement)

---

**Document Version**: 1.0
**Last Updated**: September 30, 2025
**Author**: AI Assistant
**Status**: Draft - Ready for Review

```
