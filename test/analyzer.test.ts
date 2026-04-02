import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { analyze } from '../src/analyzer.js';
import { createLogger } from '../src/utils/logger.js';
import { AngularSymbolKind } from '../src/model/angular-kinds.js';

const FIXTURES = path.resolve(__dirname, 'fixtures/mock-project');
const logger = createLogger(false, true);

describe('analyzer (integration)', () => {
  it('analyzes a single package', async () => {
    const result = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
      },
      logger,
    );

    expect(result.meta.target).toBe('@mock-scope/components');
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].name).toBe('@mock-scope/components');
    expect(result.packages[0].version).toBe('1.0.0');

    // Should have 2 entry points (root + button)
    expect(result.packages[0].entryPoints).toHaveLength(2);

    // Check used symbols
    const allSymbols = result.packages[0].entryPoints.flatMap((ep) => ep.symbols);
    const usedNames = allSymbols.filter((s) => s.used).map((s) => s.name).sort();

    expect(usedNames).toContain('AppComponent');
    expect(usedNames).toContain('DataService');
    expect(usedNames).toContain('VERSION');
    expect(usedNames).toContain('ButtonComponent');
    // ComponentsModule is re-exported, should be used
    expect(usedNames).toContain('ComponentsModule');

    // HighlightDirective and DatePipe are now used in standalone.ts decorator
    expect(usedNames).toContain('HighlightDirective');
    expect(usedNames).toContain('DatePipe');

    // Unused symbols
    const unusedNames = allSymbols.filter((s) => !s.used).map((s) => s.name).sort();
    expect(unusedNames).toContain('ComponentState');
  });

  it('classifies Angular symbols correctly', async () => {
    const result = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
      },
      logger,
    );

    const allSymbols = result.packages[0].entryPoints.flatMap((ep) => ep.symbols);
    const byName = Object.fromEntries(allSymbols.map((s) => [s.name, s]));

    expect(byName['AppComponent'].kind).toBe(AngularSymbolKind.Component);
    expect(byName['HighlightDirective'].kind).toBe(AngularSymbolKind.Directive);
    expect(byName['DatePipe'].kind).toBe(AngularSymbolKind.Pipe);
    expect(byName['DataService'].kind).toBe(AngularSymbolKind.Service);
    expect(byName['ComponentsModule'].kind).toBe(AngularSymbolKind.NgModule);
  });

  it('handles type-only imports with includeTypes=false', async () => {
    const result = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
        includeTypes: false,
      },
      logger,
    );

    const allSymbols = result.packages[0].entryPoints.flatMap((ep) => ep.symbols);
    const configSymbol = allSymbols.find((s) => s.name === 'ComponentConfig');
    // ComponentConfig is imported with `import type` — should NOT be counted as used
    expect(configSymbol?.used).toBe(false);
  });

  it('handles type-only imports with includeTypes=true', async () => {
    const result = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
        includeTypes: true,
      },
      logger,
    );

    const allSymbols = result.packages[0].entryPoints.flatMap((ep) => ep.symbols);
    const configSymbol = allSymbols.find((s) => s.name === 'ComponentConfig');
    expect(configSymbol?.used).toBe(true);
  });

  it('analyzes a scope (multiple packages)', async () => {
    const result = await analyze(
      {
        target: '@mock-scope',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
      },
      logger,
    );

    expect(result.packages).toHaveLength(2);
    expect(result.summary.totalPackages).toBe(2);
    expect(result.summary.totalExports).toBeGreaterThan(0);
  });

  it('computes summary correctly', async () => {
    const result = await analyze(
      {
        target: 'simple-lib',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
      },
      logger,
    );

    expect(result.summary.totalPackages).toBe(1);
    expect(result.summary.totalExports).toBe(3);
    // simpleHelper is used, unusedHelper and SimpleClass are not
    expect(result.summary.totalUsed).toBe(1);
    expect(result.summary.totalUnused).toBe(2);
    expect(result.summary.usageRatio).toBeCloseTo(1 / 3);
  });

  it('detects standalone component decorator usages', async () => {
    const result = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
      },
      logger,
    );

    const allSymbols = result.packages[0].entryPoints.flatMap((ep) => ep.symbols);

    // HighlightDirective is used in @Component({ imports: [...] }) in standalone.ts
    const directive = allSymbols.find((s) => s.name === 'HighlightDirective');
    expect(directive?.used).toBe(true);
    expect(directive?.usage?.usedIn.some(
      (u) => u.context === 'decorator-standalone-imports',
    )).toBe(true);

    // DatePipe is used in @Component({ providers: [...] }) in standalone.ts
    const pipe = allSymbols.find((s) => s.name === 'DatePipe');
    expect(pipe?.used).toBe(true);
    expect(pipe?.usage?.usedIn.some(
      (u) => u.context === 'decorator-providers',
    )).toBe(true);
  });

  it('detects imports through local barrels', async () => {
    const result = await analyze(
      {
        target: '@mock-scope/utils',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
      },
      logger,
    );

    const allSymbols = result.packages[0].entryPoints.flatMap((ep) => ep.symbols);

    // formatDate is re-exported in barrel.ts and imported in barrel-consumer.ts
    const formatDate = allSymbols.find((s) => s.name === 'formatDate');
    expect(formatDate?.used).toBe(true);
    // Should have usages from both barrel.ts (re-export) and barrel-consumer.ts (via barrel)
    expect(formatDate?.usage?.importedIn.length).toBeGreaterThanOrEqual(2);
  });
});
