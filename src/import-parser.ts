import type { FileInfo, ImportInfo } from "./types";

export class ImportParser {
  /**
   * Parse imports from a file based on its extension
   */
  parseImports(file: FileInfo): ImportInfo[] {
    switch (file.extension) {
      case ".vue":
        return this.parseVueFile(file.content);
      case ".ts":
      case ".tsx":
      case ".js":
      case ".jsx":
        return this.parseJsFile(file.content);
      default:
        return [];
    }
  }

  /**
   * Parse imports from a Vue single-file component
   */
  private parseVueFile(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Extract script blocks from Vue SFC
    const scriptBlocks = this.extractVueScriptBlocks(content);

    for (const block of scriptBlocks) {
      const blockImports = this.parseJsFile(block.content);
      // Adjust positions to account for the script block offset
      const adjustedImports = blockImports.map((imp) => ({
        ...imp,
        start: imp.start + block.offset,
        end: imp.end + block.offset,
        line: imp.line + block.startLine - 1,
      }));
      imports.push(...adjustedImports);
    }

    // Also check for imports in template blocks (for dynamic imports in Vue templates)
    const templateImports = this.parseVueTemplate(content);
    imports.push(...templateImports);

    return imports;
  }

  /**
   * Extract script blocks from Vue SFC
   */
  private extractVueScriptBlocks(
    content: string
  ): Array<{ content: string; offset: number; startLine: number }> {
    const blocks: Array<{
      content: string;
      offset: number;
      startLine: number;
    }> = [];

    // Match <script> and <script setup> blocks
    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = scriptRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const scriptContent = match[1] ?? "";
      const offset = match.index! + fullMatch.indexOf(scriptContent);

      // Calculate line number
      const beforeScript = content.substring(0, match.index!);
      const startLine = (beforeScript.match(/\n/g) || []).length + 1;

      blocks.push({
        content: scriptContent,
        offset,
        startLine:
          startLine +
          (
            fullMatch
              .substring(0, fullMatch.indexOf(scriptContent))
              .match(/\n/g) || []
          ).length,
      });
    }

    return blocks;
  }

  /**
   * Parse Vue template for dynamic imports (though less common)
   */
  private parseVueTemplate(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Look for dynamic imports in template expressions
    // This is less common but can happen with dynamic components
    const templateRegex = /<template(?:\s+[^>]*)?>([\s\S]*?)<\/template>/gi;
    const match = templateRegex.exec(content);

    if (match) {
      const templateContent = match[1] ?? "";
      const templateOffset = match.index! + match[0].indexOf(templateContent);

      // Look for import() calls in template expressions
      const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
      let dynamicMatch;

      while (
        (dynamicMatch = dynamicImportRegex.exec(templateContent)) !== null
      ) {
        const beforeMatch = content.substring(
          0,
          templateOffset + dynamicMatch.index!
        );
        const line = (beforeMatch.match(/\n/g) || []).length + 1;

        imports.push({
          original: dynamicMatch[0],
          path: dynamicMatch[1]!,
          start: templateOffset + dynamicMatch.index!,
          end: templateOffset + dynamicMatch.index! + dynamicMatch[0].length,
          type: "dynamic",
          line,
        });
      }
    }

    return imports;
  }

  /**
   * Parse imports from JavaScript/TypeScript files
   */
  private parseJsFile(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Parse static ES6 imports
    imports.push(...this.parseStaticImports(content));

    // Parse dynamic imports
    imports.push(...this.parseDynamicImports(content));

    // Parse require statements (for CommonJS compatibility)
    imports.push(...this.parseRequireStatements(content));

    return imports;
  }

  /**
   * Parse static ES6 import statements
   */
  private parseStaticImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Comprehensive regex for ES6 imports (including TypeScript type imports)
    const importRegex =
      /^[\s]*import\s+(?:type\s+)?(?:(?:\*\s+as\s+\w+)|(?:\w+(?:\s*,\s*)?)|(?:\{[^}]*\}(?:\s*,\s*)?)|(?:\w+\s*,\s*\{[^}]*\}))?\s+from\s+[\s]*['"`]([^'"`]+)['"`][\s]*;?$/gm;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index!);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;

      imports.push({
        original: match[0],
        path: match[1]!,
        start: match.index!,
        end: match.index! + match[0].length,
        type: "static",
        line,
      });
    }

    return imports;
  }

  /**
   * Parse dynamic import() statements
   */
  private parseDynamicImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Regex for dynamic imports: import('path') or import("path") or import(`path`)
    const dynamicImportRegex = /import\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;

    let match;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index!);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;

      imports.push({
        original: match[0],
        path: match[2]!,
        start: match.index!,
        end: match.index! + match[0].length,
        type: "dynamic",
        line,
      });
    }

    return imports;
  }

  /**
   * Parse require() statements (CommonJS)
   */
  private parseRequireStatements(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // Regex for require statements
    const requireRegex = /require\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;

    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index!);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;

      imports.push({
        original: match[0],
        path: match[2]!,
        start: match.index!,
        end: match.index! + match[0].length,
        type: "static", // Treating require as static for simplicity
        line,
      });
    }

    return imports;
  }

  /**
   * Update file content with new import paths
   */
  updateImportsInContent(
    content: string,
    updates: Array<{ from: ImportInfo; to: string }>
  ): string {
    // Sort updates by position in reverse order to avoid position shifts
    const sortedUpdates = [...updates].sort(
      (a, b) => b.from.start - a.from.start
    );

    let updatedContent = content;

    for (const update of sortedUpdates) {
      const { from, to } = update;
      const originalImport = from.original;
      const newImport = originalImport.replace(
        new RegExp(`(['"\`])${this.escapeRegex(from.path)}\\1`),
        `$1${to}$1`
      );

      updatedContent =
        updatedContent.substring(0, from.start) +
        newImport +
        updatedContent.substring(from.end);
    }

    return updatedContent;
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
