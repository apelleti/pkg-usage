import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  createDiscoveryProject,
  addAndParseDeclarationFile,
} from '../../src/discovery/dts-parser.js';
import { AngularSymbolKind } from '../../src/model/angular-kinds.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');

describe('dts-parser', () => {
  it('extracts all exported symbols from a .d.ts file', () => {
    const project = createDiscoveryProject();
    const dtsPath = path.join(
      FIXTURES,
      'node_modules/@mock-scope/components/index.d.ts',
    );
    const symbols = addAndParseDeclarationFile(
      project,
      dtsPath,
      '@mock-scope/components',
      '@mock-scope/components',
    );

    const names = symbols.map((s) => s.name).sort();
    expect(names).toEqual([
      'APP_TOKEN',
      'AppComponent',
      'ComponentConfig',
      'ComponentSize',
      'ComponentState',
      'ComponentsModule',
      'DataService',
      'DatePipe',
      'HighlightDirective',
      'VERSION',
    ]);
  });

  it('assigns base kinds correctly', () => {
    const project = createDiscoveryProject();
    const dtsPath = path.join(
      FIXTURES,
      'node_modules/@mock-scope/components/index.d.ts',
    );
    const symbols = addAndParseDeclarationFile(
      project,
      dtsPath,
      '@mock-scope/components',
      '@mock-scope/components',
    );

    const byName = Object.fromEntries(symbols.map((s) => [s.name, s]));

    expect(byName['AppComponent'].kind).toBe(AngularSymbolKind.Class);
    expect(byName['ComponentConfig'].kind).toBe(AngularSymbolKind.Interface);
    expect(byName['ComponentSize'].kind).toBe(AngularSymbolKind.TypeAlias);
    expect(byName['VERSION'].kind).toBe(AngularSymbolKind.Constant);
    expect(byName['ComponentState'].kind).toBe(AngularSymbolKind.Enum);
  });

  it('parses simple-lib with types fallback', () => {
    const project = createDiscoveryProject();
    const dtsPath = path.join(
      FIXTURES,
      'node_modules/simple-lib/index.d.ts',
    );
    const symbols = addAndParseDeclarationFile(
      project,
      dtsPath,
      'simple-lib',
      'simple-lib',
    );

    expect(symbols).toHaveLength(3);
    expect(symbols.map((s) => s.name).sort()).toEqual([
      'SimpleClass',
      'simpleHelper',
      'unusedHelper',
    ]);
  });
});
