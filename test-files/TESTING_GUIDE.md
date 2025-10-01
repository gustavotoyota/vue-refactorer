# Vue Refactorer Testing Guide

This document provides recommended test commands for the `vue-refactorer` tool using the test file structure in this directory.

**Important**: Most commands assume you're running from the `/test-files` directory, but the [Working Directory Independent Tests](#working-directory-independent-tests) section includes tests that can be run from any directory. All tests require the `vue-refactorer` CLI to be available (either globally installed or via `npx`).

## Table of Contents

1. [Working Directory Independent Tests](#working-directory-independent-tests)
2. [Basic Single File Moves](#basic-single-file-moves)
3. [Directory Moves](#directory-moves)
4. [Glob Pattern Moves](#glob-pattern-moves)
5. [Path Alias Testing](#path-alias-testing)
6. [Deep Nesting Scenarios](#deep-nesting-scenarios)
7. [Barrel Export Testing](#barrel-export-testing)
8. [Complex Refactoring Scenarios](#complex-refactoring-scenarios)
9. [Edge Cases](#edge-cases)
10. [Dry Run & Scan Commands](#dry-run--scan-commands)

---

## Working Directory Independent Tests

**Objective**: Test the tool's ability to auto-detect project root and work from various directories without explicit `--root` flags.

These tests can be run from any directory and use paths that don't start with `src/`. The tool should auto-detect the project root by finding `tsconfig.json`, `package.json`, or `.git` markers.

### Test 33: Run from repository root

**Working Directory**: `` (repository root)

```bash
# Move a utility file using test-files/ prefix
vue-refactorer move test-files/src/utils/string-utils.ts test-files/src/helpers/string-utils.ts --dry-run

# Expected behavior:
# - Auto-detects test-files as the project root (finds test-files/tsconfig.json)
# - Updates all imports within test-files/src/**
```

### Test 34: Run from components directory

**Working Directory**: `test-files\src\components\`

```bash
# Move using relative paths from component directory
vue-refactorer move common/Button.vue ui/Button.vue --dry-run

# Expected behavior:
# - Auto-detects project root by walking up to find test-files/tsconfig.json
# - Updates imports in layout/Header.vue, features/user/UserCard.vue, etc.
```

### Test 35: Run from deeply nested directory

**Working Directory**: `test-files\src\components\features\user\`

```bash
# Move a component using relative paths
vue-refactorer move UserCard.vue ../../../shared/UserCard.vue --dry-run

# Expected behavior:
# - Auto-detects project root (walks up directory tree)
# - Calculates correct relative paths for all imports
# - Updates UserProfile.vue (in same directory), index.ts, etc.
```

### Test 36: Run from utils directory with parent path

**Working Directory**: `test-files\src\utils\`

```bash
# Move file to parent directory structure
vue-refactorer move string-utils.ts ../helpers/string-utils.ts --dry-run

# Expected updates (relative to project root):
# - src/utils/index.ts
# - src/services/auth.service.ts
# - src/composables/useUser.ts
# - Multiple component files
```

### Test 37: Run from services directory

**Working Directory**: `test-files\src\services\`

```bash
# Move auth service to different location
vue-refactorer move auth.service.ts ../core/auth.service.ts --dry-run

# Expected updates:
# - src/composables/useAuth.ts
# - src/main.ts
```

### Test 38: Run with mixed path styles

**Working Directory**: `test-files\`

```bash
# Mix relative and project-relative paths
vue-refactorer move ./src/types/user.ts ./src/models/user.ts --dry-run

# Expected behavior:
# - Correctly resolves ./src/ relative to current directory
# - Updates all imports across the project
```

### Test 39: Run from parent of test-files

**Working Directory**: ``

```bash
# Move directory using test-files/ prefix
vue-refactorer move test-files/src/components/common test-files/src/components/ui --dry-run

# Expected behavior:
# - Auto-detects test-files as the project root
# - Updates all component imports
# - Handles barrel exports in common/index.ts
```

### Test 40: Scan from different directory

**Working Directory**: `test-files\src\`

```bash
# Scan for dependencies from src directory
vue-refactorer scan utils/validators.ts

# Expected output:
# - Shows all files importing validators.ts
# - Paths relative to project root
```

### Test 41: Glob pattern from subdirectory

**Working Directory**: `test-files\src\`

```bash
# Use glob pattern from src directory
vue-refactorer move "services/*.ts" core/ --dry-run

# Expected behavior:
# - Resolves glob relative to current directory
# - Moves all service files to core/
# - Updates imports in composables and main.ts
```

### Test 42: Move with absolute-style paths from anywhere

**Working Directory**: Any directory (e.g., `test-files\src\components\features\`)

```bash
# Use paths relative to current location
vue-refactorer move ../../types/product.ts ../../models/product.ts --dry-run

# Expected behavior:
# - Auto-detects project root correctly
# - Resolves complex relative paths
# - Updates all type imports
```

### Test 43: Directory content move from subdirectory

**Working Directory**: `test-files\src\components\`

```bash
# Move all files in common (not the directory itself)
vue-refactorer move "common/*" shared/ --dry-run

# Expected behavior:
# - Moves Button.vue, Input.vue, etc. to shared/
# - Updates all imports referencing these components
```

### Test 44: Test root auto-detection near .git

**Working Directory**: `test-files\src\`

```bash
# Move without specifying root (should find test-files/tsconfig.json)
vue-refactorer move utils/date-utils.ts helpers/date-utils.ts --dry-run --verbose

# Expected verbose output should show:
# - Detected project root: .../test-files
# - Config found: .../test-files/tsconfig.json
```

### Test 45: Cross-directory complex refactor

**Working Directory**: ``

```bash
# Multi-step refactoring from repo root
vue-refactorer move test-files/src/components/features/product test-files/src/modules/products/components --dry-run
vue-refactorer move test-files/src/services/product.service.ts test-files/src/modules/products/services/product.service.ts --dry-run

# Expected behavior:
# - Both commands auto-detect same project root
# - Updates are consistent across both moves
# - All cross-references are maintained
```

### Test 46: Rename from parent directory

**Working Directory**: `test-files\`

```bash
# Simple rename using relative paths
vue-refactorer move src/utils/string-utils.ts src/utils/text-utils.ts --dry-run

# Expected behavior:
# - Renames file in place
# - Updates all imports to use new name
```

### Test 47: Verify barrel exports from different directory

**Working Directory**: `test-files\src\components\`

```bash
# Move file that's part of barrel export
vue-refactorer move common/Button.vue common/ButtonComponent.vue --dry-run

# Expected updates:
# - common/index.ts (export statement)
# - All files importing from common/Button.vue or common/index.ts
```

---

### Working Directory Test Tips

1. **Auto-detection verification**: Use `--verbose` flag to see which project root was detected
2. **Path resolution**: The tool resolves all paths relative to your current working directory first, then finds the project root
3. **Consistency**: Running the same move from different directories should produce the same result
4. **tsconfig.json priority**: The tool prioritizes directories with `tsconfig.json` or `jsconfig.json` as project roots
5. **Fallback markers**: If no TypeScript config found, it looks for `package.json` or `.git` directory

### Verification Commands

After running moves from different directories:

```bash
# From any directory, check TypeScript compilation
cd test-files
npx tsc --noEmit

# Check git diff to see actual changes
git diff

# Revert changes to test more scenarios
git checkout .
```

---

## Basic Single File Moves

### Test 1: Move a utility file

**Objective**: Test basic relative import updates

```bash
# Move string-utils.ts to a different location
vue-refactorer move src/utils/string-utils.ts src/helpers/string-utils.ts --dry-run

# Expected updates:
# - src/utils/index.ts
# - src/services/auth.service.ts
# - src/composables/useUser.ts
# - src/components/layout/Header.vue
# - src/components/features/user/UserCard.vue
# - src/components/features/product/ProductCard.vue
# - src/components/features/product/ProductDetail.vue
```

### Test 2: Move a type definition file

**Objective**: Test type-only import updates

```bash
# Move user.ts from types
vue-refactorer move src/types/user.ts src/models/user.ts --dry-run

# Expected updates:
# - src/types/index.ts
# - src/services/auth.service.ts
# - src/services/user.service.ts
# - src/composables/useAuth.ts
# - src/components/features/user/UserCard.vue
```

### Test 3: Move a Vue component

**Objective**: Test .vue file moves with relative imports

```bash
# Move Button component
vue-refactorer move src/components/common/Button.vue src/components/ui/Button.vue --dry-run

# Expected updates:
# - src/components/common/index.ts
# - src/components/layout/Header.vue
# - src/components/common/Modal.vue
# - src/components/features/user/UserCard.vue
# - src/components/features/product/ProductCard.vue
# - src/components/features/product/ProductList.vue
# - src/components/features/product/ProductDetail.vue
# - src/components/features/cart/ShoppingCart.vue
```

### Test 4: Move a service file

**Objective**: Test cascade updates through multiple layers

```bash
# Move auth service
vue-refactorer move src/services/auth.service.ts src/core/auth.service.ts --dry-run

# Expected updates:
# - src/composables/useAuth.ts
# - src/main.ts
```

---

## Directory Moves

### Test 5: Move entire utils directory

**Objective**: Test directory move with many dependents

```bash
# Move utils to helpers
vue-refactorer move src/utils src/helpers --dry-run

# Expected updates: Almost all files (utils are imported everywhere)
```

### Test 6: Move types directory

**Objective**: Test type imports across the codebase

```bash
# Move types to models
vue-refactorer move src/types src/models --dry-run

# Expected updates:
# - All service files
# - All composables
# - Many component files
```

### Test 7: Move common components directory

**Objective**: Test component directory moves

```bash
# Rename common to ui
vue-refactorer move src/components/common src/components/ui --dry-run

# Expected updates:
# - src/components/layout/Header.vue
# - src/components/layout/Sidebar.vue
# - src/components/features/user/UserCard.vue
# - src/components/features/user/UserProfile.vue
# - src/components/features/product/ProductCard.vue
# - src/components/features/product/ProductList.vue
# - src/components/features/product/ProductDetail.vue
# - src/components/features/cart/ShoppingCart.vue
```

### Test 8: Move feature directory

**Objective**: Test nested directory moves

```bash
# Move user feature to a different location
vue-refactorer move src/components/features/user src/features/user --dry-run

# Expected updates:
# - src/components/App.vue
# - src/components/features/user/UserProfile.vue (imports UserCard)
```

---

## Glob Pattern Moves

### Test 9: Move all service files

**Objective**: Test glob pattern with multiple files

```bash
# Move all services to core directory
vue-refactorer move "src/services/*.ts" src/core --dry-run

# Expected updates:
# - src/composables/useAuth.ts
# - src/composables/useUser.ts
# - src/composables/useProduct.ts
# - src/main.ts
```

### Test 10: Move all Vue components in a directory

**Objective**: Test glob with .vue files

```bash
# Move all layout components to a new location
vue-refactorer move "src/components/layout/*.vue" src/layout --dry-run

# Expected updates:
# - src/components/layout/index.ts
# - src/components/App.vue
```

### Test 11: Move all files in a subdirectory

**Objective**: Test directory content moves (not the directory itself)

```bash
# Move all common components (but not the directory)
vue-refactorer move "src/components/common/*" src/components/shared --dry-run
```

---

## Path Alias Testing

### Test 12: Move file and test @ alias preservation

**Objective**: Verify alias imports are maintained when appropriate

```bash
# Move a file that's imported via @ alias
vue-refactorer move src/types/product.ts src/types/models/product.ts --dry-run

# Check that @/types imports are updated correctly
```

### Test 13: Move file and test ~ alias preservation

**Objective**: Test alternative alias

```bash
# Move validators (imported with ~ in some places)
vue-refactorer move src/utils/validators.ts src/validation/validators.ts --dry-run

# Check both @/ and ~/ aliases are handled
```

### Test 14: Test alias resolution with nested moves

**Objective**: Complex alias scenarios

```bash
# Move a deeply nested file
vue-refactorer move src/components/features/product/ProductCard.vue src/modules/products/components/ProductCard.vue --dry-run

# Verify aliases vs relative paths are chosen appropriately
```

---

## Deep Nesting Scenarios

### Test 15: Move deeply nested component up

**Objective**: Test relative path calculation from deep to shallow

```bash
# Move UserCard from features/user to components root
vue-refactorer move src/components/features/user/UserCard.vue src/components/UserCard.vue --dry-run

# Expected updates:
# - src/components/features/user/UserProfile.vue (changes from ./UserCard.vue to ../../UserCard.vue or similar)
# - src/components/features/user/index.ts
```

### Test 16: Move shallow component deep

**Objective**: Test relative path calculation from shallow to deep

```bash
# Move App.vue deeper
vue-refactorer move src/components/App.vue src/components/app/AppRoot.vue --dry-run

# Expected updates:
# - src/main.ts
```

### Test 17: Move across complex directory structures

**Objective**: Test multi-level relative paths

```bash
# Move a component to a sibling feature directory
vue-refactorer move src/components/features/user/UserCard.vue src/components/features/product/UserCard.vue --dry-run

# Expected updates:
# - src/components/features/user/UserProfile.vue (relative path changes significantly)
# - src/components/features/user/index.ts
```

---

## Barrel Export Testing

### Test 18: Move a barrel export file (index.ts)

**Objective**: Test index.ts moves

```bash
# Move utils index.ts
vue-refactorer move src/utils/index.ts src/utils/main.ts --dry-run

# Check imports that use the barrel export
```

### Test 19: Move file exported by barrel

**Objective**: Test updating barrel exports

```bash
# Move a file that's re-exported
vue-refactorer move src/components/common/Button.vue src/components/common/ButtonComponent.vue --dry-run

# Expected updates:
# - src/components/common/index.ts (should update the export)
# - All files importing from the barrel
```

### Test 20: Move entire directory with barrel exports

**Objective**: Complex barrel export scenario

```bash
# Move composables (which has barrel exports)
vue-refactorer move src/composables src/hooks --dry-run

# Expected updates:
# - src/composables/index.ts paths
# - All files importing from @/composables or ~/composables
```

---

## Complex Refactoring Scenarios

### Test 21: Reorganize feature structure

**Objective**: Simulate a real refactoring scenario

```bash
# Step 1: Move product components to new structure
vue-refactorer move src/components/features/product src/modules/products/components --dry-run

# Step 2: Move product service
vue-refactorer move src/services/product.service.ts src/modules/products/services/product.service.ts --dry-run

# Step 3: Move product composable
vue-refactorer move src/composables/useProduct.ts src/modules/products/composables/useProduct.ts --dry-run

# Step 4: Move product types
vue-refactorer move src/types/product.ts src/modules/products/types/product.ts --dry-run
```

### Test 22: Flatten directory structure

**Objective**: Test moving from nested to flat

```bash
# Move all features to root components
vue-refactorer move "src/components/features/**/*.vue" src/components --dry-run
```

### Test 23: Create new layer of organization

**Objective**: Add new directory level

```bash
# Add "domains" layer
vue-refactorer move src/types src/domains/shared/types --dry-run
vue-refactorer move src/utils src/domains/shared/utils --dry-run
```

---

## Edge Cases

### Test 24: Move file to same directory with new name

**Objective**: Simple rename

```bash
# Rename a file in place
vue-refactorer move src/utils/string-utils.ts src/utils/text-utils.ts --dry-run
```

### Test 25: Move to existing directory (merge scenario)

**Objective**: Test directory merging

```bash
# Create a conflicting structure first, then:
# (This tests if the tool handles existing directories)
vue-refactorer move src/components/common src/components/layout --dry-run
```

### Test 26: Move multiple related files

**Objective**: Test consistency across related moves

```bash
# Move user-related files together
vue-refactorer move src/types/user.ts src/domains/user/types/user.ts --dry-run
# Then:
vue-refactorer move src/services/user.service.ts src/domains/user/services/user.service.ts --dry-run
```

### Test 27: Move file with mixed import styles

**Objective**: Test files with both relative and alias imports

```bash
# useUser has both relative and alias imports
vue-refactorer move src/composables/useUser.ts src/hooks/useUser.ts --dry-run

# Verify both import styles are updated correctly
```

### Test 28: Test with file extensions in imports

**Objective**: Verify extension handling

```bash
# Some imports might include .ts or .vue extensions
vue-refactorer move src/components/features/user/UserCard.vue src/shared/UserCard.vue --dry-run
```

---

## Dry Run & Scan Commands

### Test 29: Scan for dependencies before moving

**Objective**: Preview impact before making changes

```bash
# Scan what imports a specific file
vue-refactorer scan src/utils/validators.ts

# See all files that would be affected
```

### Test 30: Dry run with verbose output

**Objective**: Detailed logging of operations

```bash
# See detailed output of what would change
vue-refactorer move src/services/auth.service.ts src/core/auth.service.ts --dry-run --verbose
```

### Test 31: Test with custom aliases

**Objective**: Verify custom alias configuration

```bash
# Add custom alias and test
vue-refactorer move src/types/user.ts src/models/user.ts --alias "#:./src" --dry-run
```

### Test 32: Test ignoring specific patterns

**Objective**: Verify .gitignore respect

```bash
# Ensure node_modules and dist are ignored
vue-refactorer scan src --verbose
# Should not show any node_modules or dist files
```

---

## Testing Workflow Recommendations

### Complete Test Suite

Run these commands in sequence to perform a comprehensive test:

```bash
# 1. Initial scan to understand dependencies
vue-refactorer scan src

# 2. Test simple file move (dry run)
vue-refactorer move src/utils/string-utils.ts src/helpers/string-utils.ts --dry-run --verbose

# 3. Execute if dry run looks good
vue-refactorer move src/utils/string-utils.ts src/helpers/string-utils.ts --verbose

# 4. Verify with git diff
git diff

# 5. Revert to test another scenario
git checkout .

# 6. Test directory move
vue-refactorer move src/components/common src/components/ui --dry-run --verbose

# 7. Test complex glob pattern
vue-refactorer move "src/services/*.ts" src/core --dry-run

# 8. Test deeply nested scenario
vue-refactorer move src/components/features/user/UserCard.vue src/shared/UserCard.vue --dry-run --verbose
```

### Recommended Test Order

1. **Start Simple**: Single file moves with few dependencies
2. **Increase Complexity**: Files with many imports
3. **Test Directories**: Whole directory moves
4. **Glob Patterns**: Bulk operations
5. **Edge Cases**: Unusual scenarios
6. **Real Refactoring**: Multi-step reorganization

### Verification Checklist

After each move operation, verify:

- [ ] All import paths are updated correctly
- [ ] No broken imports (check with TypeScript compiler)
- [ ] Relative paths use correct depth (../, ../../, etc.)
- [ ] Path aliases are used/preserved appropriately
- [ ] Barrel exports (index.ts) are updated
- [ ] No files are accidentally skipped
- [ ] .gitignore is respected (no node_modules changes)
- [ ] File extensions are preserved in imports (if originally present)

### TypeScript Validation

After running moves, validate with TypeScript:

```bash
# Check for TypeScript errors
npx tsc --noEmit

# Or if you have it configured
bun run build
```

---

## Expected Behaviors

### What Should Work

- ✅ Relative imports update correctly at any nesting level
- ✅ Path aliases (@/, ~/) are preserved when appropriate
- ✅ Type-only imports are handled correctly
- ✅ Vue SFC imports are updated
- ✅ Barrel exports (index.ts) are updated
- ✅ Multiple files depending on moved file all update
- ✅ Directory moves update all internal and external references
- ✅ Glob patterns match and move multiple files
- ✅ Dry run shows changes without executing

### Known Considerations

- Extension behavior depends on original import style
- Alias vs relative path choice may be based on heuristics
- Very complex circular dependencies might need manual review
- Dynamic imports with template strings may not be caught

---

## Quick Reference

### Most Important Tests

If you only have time for a few tests, run these:

```bash
# Test 1: Simple utility move
vue-refactorer move src/utils/string-utils.ts src/helpers/string-utils.ts --dry-run

# Test 2: Component move (tests Vue SFC handling)
vue-refactorer move src/components/common/Button.vue src/components/ui/Button.vue --dry-run

# Test 3: Directory move (tests bulk updates)
vue-refactorer move src/types src/models --dry-run

# Test 4: Glob pattern (tests pattern matching)
vue-refactorer move "src/services/*.ts" src/core --dry-run

# Test 5: Deep nesting (tests relative path calculation)
vue-refactorer move src/components/features/user/UserCard.vue src/shared/UserCard.vue --dry-run
```

---

## Troubleshooting

### If something doesn't work as expected:

1. **Check the dry-run output first**: Always use `--dry-run` before actual moves
2. **Use verbose mode**: Add `--verbose` for detailed logging
3. **Verify aliases**: Check that tsconfig.json paths are correct
4. **Check .gitignore**: Ensure files aren't being ignored unintentionally
5. **Examine import syntax**: Some dynamic imports may not be caught
6. **Validate manually**: Compare expected vs actual changes in git diff

### Common Issues

- **Import not updated**: File might be in .gitignore or outside scanned extensions
- **Wrong relative path**: Edge case in path calculation logic
- **Alias not used**: Heuristic might prefer relative path
- **Barrel export not updated**: Check if barrel export uses re-export syntax

---

## Contributing Test Results

When testing, please document:

1. Command used
2. Expected behavior
3. Actual behavior
4. Any errors or warnings
5. Git diff summary

This helps improve the tool!
