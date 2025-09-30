# Test Files for Vue Refactorer

This directory contains a test file structure for testing the `vue-refactorer` tool.

## Structure

```
test-files/
├── src/
│   ├── types/                    # Type definitions
│   │   ├── user.ts
│   │   ├── product.ts
│   │   └── index.ts             # Barrel export
│   ├── utils/                   # Utility functions
│   │   ├── string-utils.ts
│   │   ├── date-utils.ts
│   │   ├── validators.ts
│   │   └── index.ts             # Barrel export
│   ├── services/                # Service layer
│   │   ├── api.ts
│   │   ├── auth.service.ts
│   │   └── user.service.ts
│   ├── composables/             # Vue composables
│   │   ├── useAuth.ts
│   │   ├── useUser.ts
│   │   └── index.ts             # Barrel export
│   ├── components/
│   │   ├── common/              # Common components
│   │   │   ├── Button.vue
│   │   │   ├── Input.vue
│   │   │   └── index.ts
│   │   ├── layout/              # Layout components
│   │   │   ├── Header.vue
│   │   │   ├── Footer.vue
│   │   │   ├── Sidebar.vue
│   │   │   └── index.ts
│   │   ├── features/            # Feature-specific components
│   │   │   ├── user/
│   │   │   │   ├── UserProfile.vue
│   │   │   │   ├── UserCard.vue
│   │   │   │   └── index.ts
│   │   │   └── product/
│   │   │       ├── ProductList.vue
│   │   │       ├── ProductCard.vue
│   │   │       └── index.ts
│   │   └── App.vue              # Root component
│   └── main.ts                  # Entry point
├── tsconfig.json
├── package.json
└── README.md
```

## Import Patterns

This test structure includes various import patterns:

### 1. Relative Imports

- `./component` - Same directory
- `../utils` - Parent directory
- `../../common` - Multiple levels up

### 2. Path Aliases

- `@/types` - Alias to src/types
- `~/utils` - Alternative alias to src/utils
- Both `@` and `~` resolve to the `src` directory

### 3. Barrel Exports

- Index files that re-export modules
- Example: `import { Button } from './common'` resolves to `./common/index.ts`

### 4. Mixed Imports

- Named imports: `import { capitalize } from './utils'`
- Default imports: `import Button from './Button.vue'`
- Type imports: `import type { User } from './types'`

## Dependency Graph

```
main.ts
  └─> App.vue
      ├─> layout components
      │   ├─> Header.vue
      │   │   ├─> useAuth composable
      │   │   ├─> Button component
      │   │   └─> string-utils
      │   ├─> Footer.vue
      │   │   └─> date-utils
      │   └─> Sidebar.vue
      │       └─> useAuth composable
      ├─> feature components
      │   ├─> UserProfile.vue
      │   │   ├─> useUser composable
      │   │   ├─> UserCard.vue
      │   │   │   ├─> Button component
      │   │   │   ├─> string-utils
      │   │   │   └─> date-utils
      │   │   └─> common components
      │   └─> ProductList.vue
      │       ├─> ProductCard.vue
      │       │   ├─> Button component
      │       │   ├─> string-utils
      │       │   └─> validators
      │       └─> Input component
      └─> composables
          ├─> useAuth
          │   └─> auth.service
          │       ├─> api.ts
          │       └─> validators
          └─> useUser
              ├─> user.service
              │   ├─> api.ts
              │   └─> validators
              └─> date-utils
```

## Testing Scenarios

This structure allows testing:

1. **Single file moves**: Move one component and update its imports
2. **Directory moves**: Move entire directories (e.g., `common/` to `shared/`)
3. **Deep nesting**: Test relative path resolution at various depths
4. **Alias resolution**: Test `@/` and `~/` path aliases
5. **Barrel exports**: Test index.ts re-exports
6. **Mixed file types**: Vue, TypeScript, with various import syntaxes
7. **Cross-cutting concerns**: Utils imported by multiple components
8. **Type imports**: TypeScript type-only imports
9. **Vue-specific**: Script setup, component imports
10. **Service layer**: Complex dependency chains

## No Circular Dependencies

The structure is designed without circular dependencies:

- Types depend on nothing
- Utils depend on nothing (or other utils)
- Services depend on utils and types
- Composables depend on services, utils, and types
- Components depend on composables, utils, types, and other components (but not circularly)
