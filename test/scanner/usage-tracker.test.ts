import { describe, it, expect } from 'vitest';
import { trackUsages } from '../../src/scanner/usage-tracker.js';
import { AngularSymbolKind } from '../../src/model/angular-kinds.js';
import type { CollectedImport, ExportedSymbol } from '../../src/model/types.js';

describe('usage-tracker', () => {
  const symbols: ExportedSymbol[] = [
    {
      name: 'Foo',
      kind: AngularSymbolKind.Component,
      entryPoint: '@pkg/a',
      packageName: '@pkg/a',
    },
    {
      name: 'Bar',
      kind: AngularSymbolKind.Service,
      entryPoint: '@pkg/a',
      packageName: '@pkg/a',
    },
    {
      name: 'Baz',
      kind: AngularSymbolKind.Interface,
      entryPoint: '@pkg/a',
      packageName: '@pkg/a',
    },
  ];

  it('marks imported symbols as used', () => {
    const imports: CollectedImport[] = [
      {
        symbolName: 'Foo',
        moduleSpecifier: '@pkg/a',
        filePath: '/src/app.ts',
        line: 1,
        column: 1,
        isTypeOnly: false,
        isReExport: false,
      },
    ];

    const usageMap = trackUsages(imports, symbols, false);
    expect(usageMap.has('@pkg/a::Foo')).toBe(true);
    expect(usageMap.get('@pkg/a::Foo')!.usageKind).toBe('runtime');
  });

  it('excludes type-only imports when includeTypes is false', () => {
    const imports: CollectedImport[] = [
      {
        symbolName: 'Baz',
        moduleSpecifier: '@pkg/a',
        filePath: '/src/app.ts',
        line: 1,
        column: 1,
        isTypeOnly: true,
        isReExport: false,
      },
    ];

    const usageMap = trackUsages(imports, symbols, false);
    const usage = usageMap.get('@pkg/a::Baz');
    expect(usage).toBeDefined();
    expect(usage!.usageKind).toBe('type-only');
    expect(usage!.usedIn).toHaveLength(0);
  });

  it('includes type-only imports when includeTypes is true', () => {
    const imports: CollectedImport[] = [
      {
        symbolName: 'Baz',
        moduleSpecifier: '@pkg/a',
        filePath: '/src/app.ts',
        line: 1,
        column: 1,
        isTypeOnly: true,
        isReExport: false,
      },
    ];

    const usageMap = trackUsages(imports, symbols, true);
    const usage = usageMap.get('@pkg/a::Baz');
    expect(usage).toBeDefined();
    expect(usage!.usedIn).toHaveLength(1);
  });

  it('detects "both" usage kind', () => {
    const imports: CollectedImport[] = [
      {
        symbolName: 'Foo',
        moduleSpecifier: '@pkg/a',
        filePath: '/src/app.ts',
        line: 1,
        column: 1,
        isTypeOnly: false,
        isReExport: false,
      },
      {
        symbolName: 'Foo',
        moduleSpecifier: '@pkg/a',
        filePath: '/src/types.ts',
        line: 1,
        column: 1,
        isTypeOnly: true,
        isReExport: false,
      },
    ];

    const usageMap = trackUsages(imports, symbols, false);
    expect(usageMap.get('@pkg/a::Foo')!.usageKind).toBe('both');
  });

  it('does not create usage for symbols with no imports', () => {
    const usageMap = trackUsages([], symbols, false);
    expect(usageMap.size).toBe(0);
  });
});
