import { describe, expect, test } from "vitest";
import { ImportParser } from "./import-parser";
import type { FileInfo } from "./types";

describe("ImportParser", () => {
  const parser = new ImportParser();

  describe("JavaScript/TypeScript imports", () => {
    test("should parse basic ES6 imports", () => {
      const content = `import React from 'react';
import { Component } from 'vue';
import * as Utils from './utils';
import { Button, Input } from '@/components';
export default class MyClass {}`;

      const file: FileInfo = {
        absolutePath: "/test.ts",
        relativePath: "test.ts",
        extension: ".ts",
        content,
        imports: [],
      };

      const imports = parser.parseImports(file);

      expect(imports).toHaveLength(4);
      expect(imports[0]).toMatchObject({
        path: "react",
        type: "static",
        line: 1,
      });
      expect(imports[1]).toMatchObject({
        path: "vue",
        type: "static",
        line: 2,
      });
      expect(imports[2]).toMatchObject({
        path: "./utils",
        type: "static",
        line: 3,
      });
      expect(imports[3]).toMatchObject({
        path: "@/components",
        type: "static",
        line: 4,
      });
    });

    test("should parse dynamic imports", () => {
      const content = `const LazyComponent = () => import('./LazyComponent');
const module = await import('@/utils/helper');
const dynamicImport = import("../components/Modal");`;

      const file: FileInfo = {
        absolutePath: "/test.ts",
        relativePath: "test.ts",
        extension: ".ts",
        content,
        imports: [],
      };

      const imports = parser.parseImports(file);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toMatchObject({
        path: "./LazyComponent",
        type: "dynamic",
        line: 1,
      });
      expect(imports[1]).toMatchObject({
        path: "@/utils/helper",
        type: "dynamic",
        line: 2,
      });
      expect(imports[2]).toMatchObject({
        path: "../components/Modal",
        type: "dynamic",
        line: 3,
      });
    });

    test("should parse require statements", () => {
      const content = `const fs = require('fs');
const utils = require('./utils');
const config = require('@/config/app');`;

      const file: FileInfo = {
        absolutePath: "/test.js",
        relativePath: "test.js",
        extension: ".js",
        content,
        imports: [],
      };

      const imports = parser.parseImports(file);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toMatchObject({
        path: "fs",
        type: "static",
        line: 1,
      });
      expect(imports[1]).toMatchObject({
        path: "./utils",
        type: "static",
        line: 2,
      });
      expect(imports[2]).toMatchObject({
        path: "@/config/app",
        type: "static",
        line: 3,
      });
    });

    test("should handle complex import statements", () => {
      const content = `import defaultExport, { namedExport1, namedExport2 } from './complex';
import {
  multiLine,
  multiLine as importAlias
} from '@/multi-line';
import type { TypeOnly } from './types';
// This is a comment with import keyword
const notAnImport = "import fake from 'fake'";`;

      const file: FileInfo = {
        absolutePath: "/test.ts",
        relativePath: "test.ts",
        extension: ".ts",
        content,
        imports: [],
      };

      const imports = parser.parseImports(file);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toMatchObject({
        path: "./complex",
        type: "static",
        line: 1,
      });
      expect(imports[1]).toMatchObject({
        path: "@/multi-line",
        type: "static",
        line: 2,
      });
      expect(imports[2]).toMatchObject({
        path: "./types",
        type: "static",
        line: 6,
      });
    });
  });

  describe("Vue file imports", () => {
    test("should parse imports from Vue script blocks", () => {
      const content = `
<template>
  <div>
    <MyComponent />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MyComponent from '@/components/MyComponent.vue';
import { useStore } from '~/stores/main';

const count = ref(0);
</script>

<style scoped>
.container {
  padding: 1rem;
}
</style>
`;

      const file: FileInfo = {
        absolutePath: "/test.vue",
        relativePath: "test.vue",
        extension: ".vue",
        content,
        imports: [],
      };

      const imports = parser.parseImports(file);

      expect(imports).toHaveLength(3);
      expect(imports[0]).toMatchObject({
        path: "vue",
        type: "static",
      });
      expect(imports[1]).toMatchObject({
        path: "@/components/MyComponent.vue",
        type: "static",
      });
      expect(imports[2]).toMatchObject({
        path: "~/stores/main",
        type: "static",
      });
    });

    test("should parse imports from multiple script blocks", () => {
      const content = `
<template>
  <div>{{ message }}</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import BaseComponent from './BaseComponent.vue';

export default defineComponent({
  name: 'TestComponent'
});
</script>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const message = ref('Hello');
</script>
`;

      const file: FileInfo = {
        absolutePath: "/test.vue",
        relativePath: "test.vue",
        extension: ".vue",
        content,
        imports: [],
      };

      const imports = parser.parseImports(file);

      expect(imports).toHaveLength(4);
      expect(imports.map((imp) => imp.path)).toEqual([
        "vue",
        "./BaseComponent.vue",
        "vue",
        "vue-router",
      ]);
    });

    test("should handle Vue files with dynamic imports in templates", () => {
      const content = `
<template>
  <component :is="dynamicComponent" />
</template>

<script setup>
import { defineAsyncComponent } from 'vue';

const dynamicComponent = defineAsyncComponent(() => import('@/components/Dynamic.vue'));
</script>
`;

      const file: FileInfo = {
        absolutePath: "/test.vue",
        relativePath: "test.vue",
        extension: ".vue",
        content,
        imports: [],
      };

      const imports = parser.parseImports(file);

      expect(imports).toHaveLength(2);
      expect(imports[0]).toMatchObject({
        path: "vue",
        type: "static",
      });
      expect(imports[1]).toMatchObject({
        path: "@/components/Dynamic.vue",
        type: "dynamic",
      });
    });
  });

  describe("Import content updating", () => {
    test("should update import paths correctly", () => {
      const content = `
import Component from './Component.vue';
import { helper } from '@/utils/helper';
const dynamic = import('./dynamic');
`;

      const updates = [
        {
          from: {
            original: "import Component from './Component.vue';",
            path: "./Component.vue",
            start: content.indexOf("import Component from './Component.vue';"),
            end:
              content.indexOf("import Component from './Component.vue';") +
              "import Component from './Component.vue';".length,
            type: "static" as const,
            line: 2,
          },
          to: "../components/Component.vue",
        },
        {
          from: {
            original: "import { helper } from '@/utils/helper';",
            path: "@/utils/helper",
            start: content.indexOf("import { helper } from '@/utils/helper';"),
            end:
              content.indexOf("import { helper } from '@/utils/helper';") +
              "import { helper } from '@/utils/helper';".length,
            type: "static" as const,
            line: 3,
          },
          to: "@/helpers/helper",
        },
      ];

      const result = parser.updateImportsInContent(content, updates);

      expect(result).toContain(
        "import Component from '../components/Component.vue';"
      );
      expect(result).toContain("import { helper } from '@/helpers/helper';");
      expect(result).toContain("const dynamic = import('./dynamic');"); // Should remain unchanged
    });

    test("should handle multiple updates without position conflicts", () => {
      const content = `
import A from './a';
import B from './b';
import C from './c';
`;

      const updates = [
        {
          from: {
            original: "import A from './a';",
            path: "./a",
            start: content.indexOf("import A from './a';"),
            end:
              content.indexOf("import A from './a';") +
              "import A from './a';".length,
            type: "static" as const,
            line: 2,
          },
          to: "./new-a",
        },
        {
          from: {
            original: "import C from './c';",
            path: "./c",
            start: content.indexOf("import C from './c';"),
            end:
              content.indexOf("import C from './c';") +
              "import C from './c';".length,
            type: "static" as const,
            line: 4,
          },
          to: "./new-c",
        },
      ];

      const result = parser.updateImportsInContent(content, updates);

      expect(result).toContain("import A from './new-a';");
      expect(result).toContain("import B from './b';"); // Should remain unchanged
      expect(result).toContain("import C from './new-c';");
    });
  });
});
