import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  createDiscoveryProject,
  addAndParseDeclarationFile,
} from '../../src/discovery/dts-parser.js';
import { classifyAngularSymbols } from '../../src/discovery/angular-classifier.js';
import { AngularSymbolKind } from '../../src/model/angular-kinds.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');

describe('angular-classifier', () => {
  it('classifies Angular symbols via ɵ markers', () => {
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

    classifyAngularSymbols(symbols, project);

    const byName = Object.fromEntries(symbols.map((s) => [s.name, s]));

    expect(byName['AppComponent'].kind).toBe(AngularSymbolKind.Component);
    expect(byName['HighlightDirective'].kind).toBe(AngularSymbolKind.Directive);
    expect(byName['DatePipe'].kind).toBe(AngularSymbolKind.Pipe);
    expect(byName['ComponentsModule'].kind).toBe(AngularSymbolKind.NgModule);
    expect(byName['DataService'].kind).toBe(AngularSymbolKind.Service);
  });

  it('classifies InjectionToken constants', () => {
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

    classifyAngularSymbols(symbols, project);

    const token = symbols.find((s) => s.name === 'APP_TOKEN');
    expect(token?.kind).toBe(AngularSymbolKind.Token);
  });

  it('leaves non-Angular classes unchanged', () => {
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

    classifyAngularSymbols(symbols, project);

    const cls = symbols.find((s) => s.name === 'SimpleClass');
    expect(cls?.kind).toBe(AngularSymbolKind.Class);
  });
});
