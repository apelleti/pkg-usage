import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createScannerProject } from '../../src/scanner/import-collector.js';
import { scanTemplates } from '../../src/scanner/template-scanner.js';
import { AngularSymbolKind } from '../../src/model/angular-kinds.js';
import type { ExportedSymbol } from '../../src/model/types.js';
import { createLogger } from '../../src/utils/logger.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');
const logger = createLogger(false, true);

describe('template-scanner', () => {
  const symbols: ExportedSymbol[] = [
    { name: 'ButtonComponent', kind: AngularSymbolKind.Component, entryPoint: '@mock-scope/components/button', packageName: '@mock-scope/components', selector: 'app-button' },
    { name: 'HighlightDirective', kind: AngularSymbolKind.Directive, entryPoint: '@mock-scope/components', packageName: '@mock-scope/components', selector: '[highlight]' },
    { name: 'DatePipe', kind: AngularSymbolKind.Pipe, entryPoint: '@mock-scope/components', packageName: '@mock-scope/components' },
  ];

  it('detects component selectors in external templates', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const usages = scanTemplates(project, symbols, logger);

    const buttonUsage = usages.find((u) => u.symbolName === 'ButtonComponent');
    expect(buttonUsage).toBeDefined();
    expect(buttonUsage!.location.context).toBe('template');
    expect(buttonUsage!.location.filePath).toContain('template.component.html');
  });

  it('detects directive attributes in templates', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const usages = scanTemplates(project, symbols, logger);

    const directiveUsage = usages.find((u) => u.symbolName === 'HighlightDirective');
    expect(directiveUsage).toBeDefined();
    expect(directiveUsage!.location.context).toBe('template');
  });

  it('detects pipe usages in templates', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const usages = scanTemplates(project, symbols, logger);

    const pipeUsage = usages.find((u) => u.symbolName === 'DatePipe');
    expect(pipeUsage).toBeDefined();
    expect(pipeUsage!.location.context).toBe('template');
  });
});
