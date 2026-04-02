import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createScannerProject } from '../../src/scanner/import-collector.js';
import { collectDecoratorUsages } from '../../src/scanner/decorator-scanner.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');

describe('decorator-scanner', () => {
  it('detects symbols in @Component imports array', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const importedSymbols = new Set([
      'ButtonComponent',
      'HighlightDirective',
      'DatePipe',
    ]);
    const usages = collectDecoratorUsages(project, importedSymbols);

    const symbolNames = usages.map((u) => u.symbolName);
    expect(symbolNames).toContain('ButtonComponent');
    expect(symbolNames).toContain('HighlightDirective');
  });

  it('sets context to decorator-standalone-imports for @Component', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const importedSymbols = new Set(['ButtonComponent', 'HighlightDirective']);
    const usages = collectDecoratorUsages(project, importedSymbols);

    const btnUsage = usages.find((u) => u.symbolName === 'ButtonComponent');
    expect(btnUsage?.location.context).toBe('decorator-standalone-imports');
  });

  it('detects symbols in providers array', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const importedSymbols = new Set(['DatePipe']);
    const usages = collectDecoratorUsages(project, importedSymbols);

    const pipeUsage = usages.find((u) => u.symbolName === 'DatePipe');
    expect(pipeUsage).toBeDefined();
    expect(pipeUsage?.location.context).toBe('decorator-providers');
  });

  it('ignores symbols not in the imported set', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const importedSymbols = new Set(['NonExistentSymbol']);
    const usages = collectDecoratorUsages(project, importedSymbols);

    expect(usages).toHaveLength(0);
  });
});
