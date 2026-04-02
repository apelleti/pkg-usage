import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  createScannerProject,
  collectImports,
} from '../../src/scanner/import-collector.js';
import { createLogger } from '../../src/utils/logger.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');
const logger = createLogger(false, true);

describe('import-collector', () => {
  it('collects named imports from target packages', () => {
    const project = createScannerProject(
      FIXTURES,
      './tsconfig.json',
      false,
      [],
    );
    const targets = new Set(['@mock-scope/components', 'simple-lib']);
    const imports = collectImports(project, targets, logger);

    const symbolNames = imports.map((i) => i.symbolName);
    expect(symbolNames).toContain('AppComponent');
    expect(symbolNames).toContain('DataService');
    expect(symbolNames).toContain('VERSION');
    expect(symbolNames).toContain('ButtonComponent');
    expect(symbolNames).toContain('simpleHelper');
  });

  it('detects type-only imports', () => {
    const project = createScannerProject(
      FIXTURES,
      './tsconfig.json',
      false,
      [],
    );
    const targets = new Set(['@mock-scope/components']);
    const imports = collectImports(project, targets, logger);

    const typeOnlyImport = imports.find((i) => i.symbolName === 'ComponentConfig');
    expect(typeOnlyImport).toBeDefined();
    expect(typeOnlyImport!.isTypeOnly).toBe(true);
  });

  it('detects re-exports', () => {
    const project = createScannerProject(
      FIXTURES,
      './tsconfig.json',
      false,
      [],
    );
    const targets = new Set(['@mock-scope/components']);
    const imports = collectImports(project, targets, logger);

    const reExport = imports.find(
      (i) => i.symbolName === 'ComponentsModule' && i.isReExport,
    );
    expect(reExport).toBeDefined();
    expect(reExport!.isReExport).toBe(true);
  });

  it('excludes test files by default', () => {
    const project = createScannerProject(
      FIXTURES,
      './tsconfig.json',
      false,
      [],
    );
    const targets = new Set(['@mock-scope/utils']);
    const imports = collectImports(project, targets, logger);

    // formatDate from app.spec.ts should be excluded, but barrel.ts re-export is kept
    const specImport = imports.find(
      (i) => i.symbolName === 'formatDate' && i.filePath.includes('app.spec.ts'),
    );
    expect(specImport).toBeUndefined();

    // barrel.ts re-export should still be present
    const barrelReExport = imports.find(
      (i) => i.symbolName === 'formatDate' && i.isReExport,
    );
    expect(barrelReExport).toBeDefined();
  });

  it('includes test files when includeTests is true', () => {
    const project = createScannerProject(
      FIXTURES,
      './tsconfig.json',
      true,
      [],
    );
    const targets = new Set(['@mock-scope/utils']);
    const imports = collectImports(project, targets, logger);

    const specImport = imports.find(
      (i) => i.symbolName === 'formatDate' && i.filePath.includes('app.spec.ts'),
    );
    expect(specImport).toBeDefined();
  });

  it('collects imports from sub-entry-points', () => {
    const project = createScannerProject(
      FIXTURES,
      './tsconfig.json',
      false,
      [],
    );
    const targets = new Set(['@mock-scope/components']);
    const imports = collectImports(project, targets, logger);

    const buttonImport = imports.find((i) => i.symbolName === 'ButtonComponent');
    expect(buttonImport).toBeDefined();
    expect(buttonImport!.moduleSpecifier).toBe('@mock-scope/components/button');
  });
});
