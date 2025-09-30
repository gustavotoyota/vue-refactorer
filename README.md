# Vue Refactorer

A command-line tool for moving files and directories in Vue.js, TypeScript, and JavaScript projects while automatically updating all import references.

---

## Installation

The recommended way to use Vue Refactorer is with `npx`, which doesn't require a permanent installation.

```bash
npx vue-refactorer --help
# or
pnpx vue-refactorer --help
# or
bunx vue-refactorer --help
```

Alternatively, you can install it globally using npm.

```bash
npm install -g vue-refactorer
# or
yarn global add vue-refactorer
# or
pnpm install -g vue-refactorer
# or
bun install -g vue-refactorer
```

---

## Usage

The basic command structure is to specify one or more sources and a destination.

```bash
vue-refactorer move <source...> <destination> [options]
```

Path aliases (like `@` or `~`) are automatically detected from your `tsconfig.json` or `jsconfig.json` files.

### Examples

- **Move a single file:**

  ```bash
  npx vue-refactorer move src/components/Button.vue src/shared/Button.vue
  ```

- **Move multiple files at once:**

  ```bash
  npx vue-refactorer move src/components/Button.vue src/components/Input.vue src/shared/
  ```

- **Move an entire directory:**

  ```bash
  npx vue-refactorer move src/components src/shared/components
  ```

- **Move only the contents of a directory:**

  ```bash
  npx vue-refactorer move src/components/* src/shared
  ```

- **Move all `.vue` files from a directory:**

  ```bash
  npx vue-refactorer move src/components/*.vue src/shared
  ```

- **Move files recursively using a glob pattern:**

  ```bash
  npx vue-refactorer move src/**/*.test.js tests
  ```

- **Perform a dry run** to see which files would be changed without actually moving anything:

  ```bash
  npx vue-refactorer move src/components src/shared --dry-run
  ```

---

## Common Options

You can add these flags to the `move` command.

| Option               | Alias | Description                                                                 |
| :------------------- | :---- | :-------------------------------------------------------------------------- |
| `--dry-run`          | `-d`  | Show what would be moved without actually making changes.                   |
| `--root <path>`      | `-r`  | Specify the project's root directory (auto-detected if not provided).       |
| `--extensions <ext>` | `-e`  | File extensions to process, comma-separated (default: `.vue,.ts,.tsx,.js`). |
| `--no-gitignore`     |       | Do not respect `.gitignore` files when scanning.                            |
| `--verbose`          | `-v`  | Enable detailed logging output for debugging.                               |

**Note:** Path aliases are automatically detected from your `tsconfig.json` or `jsconfig.json` files.

---

## Scan Command

You can use the `scan` command to preview all files and their imports without making any changes:

```bash
npx vue-refactorer scan [options]
```

This is useful for:

- Understanding the structure of your project
- Verifying that imports are being detected correctly
- Debugging import resolution issues

The scan command supports the same options as the move command (`--root`, `--extensions`, `--no-gitignore`, `--verbose`).

---

## License

MIT License - see [LICENSE](LICENSE) file for details.
