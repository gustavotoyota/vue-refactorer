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

The basic command structure is to specify a source and a destination.

```bash
vue-refactorer move <source> <destination> [options]
```

### Examples

- **Move a single file:**

  ```bash
  npx vue-refactorer move src/components/Button.vue src/shared/Button.vue
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

| Option                 | Alias | Description                                               |
| :--------------------- | :---- | :-------------------------------------------------------- |
| `--dry-run`            | `-d`  | Show what would be moved without actually making changes. |
| `--root <path>`        | `-r`  | Specify the project's root directory to scan from.        |
| `--alias <alias:path>` | `-a`  | Define a custom path alias (e.g., `@:src`).               |
| `--verbose`            | `-v`  | Enable detailed logging output for debugging.             |

---

## License

MIT License - see [LICENSE](LICENSE) file for details.
