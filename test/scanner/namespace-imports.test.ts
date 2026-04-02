import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  createScannerProject,
  collectImports,
} from '../../src/scanner/import-collector.js';
import { trackUsages } from '../../src/scanner/usage-tracker.js';
import { createLogger } from '../../src/utils/logger.js';
import { AngularSymbolKind } from '../../src/model/angular-kinds.js';
import type { ExportedSymbol } from '../../src/model/types.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');
const logger = createLogger(false, true);

describe('namespace-imports', () => {
  it('collects namespace imports as wildcard entries', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const targets = new Set(['@mock-scope/components']);
    const imports = collectImports(project, targets, logger);

    const nsImport = imports.find((i) => i.isNamespaceImport);
    expect(nsImport).toBeDefined();
    expect(nsImport!.symbolName).toBe('*');
    expect(nsImport!.namespaceAlias).toBe('components');
    expect(nsImport!.moduleSpecifier).toBe('@mock-scope/components');
  });

  it('resolves namespace property accesses when project is provided', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const targets = new Set(['@mock-scope/components']);
    const imports = collectImports(project, targets, logger);

    const exportedSymbols: ExportedSymbol[] = [
      { name: 'AppComponent', kind: AngularSymbolKind.Component, entryPoint: '@mock-scope/components', packageName: '@mock-scope/components' },
      { name: 'VERSION', kind: AngularSymbolKind.Constant, entryPoint: '@mock-scope/components', packageName: '@mock-scope/components' },
      { name: 'UnusedSymbol', kind: AngularSymbolKind.Class, entryPoint: '@mock-scope/components', packageName: '@mock-scope/components' },
    ];

    // With project (deep mode), namespace usages should be resolved
    const usageMap = trackUsages(imports, exportedSymbols, false, [], true, project);

    // AppComponent is used via both named import and namespace (components.AppComponent)
    expect(usageMap.has('@mock-scope/components::AppComponent')).toBe(true);
    // VERSION is used via both named import and namespace (components.VERSION)
    expect(usageMap.has('@mock-scope/components::VERSION')).toBe(true);
  });
});
