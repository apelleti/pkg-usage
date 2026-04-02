import { describe, it, expect } from 'vitest';
import { toMarkdown } from '../../src/reporters/markdown-reporter.js';
import { AngularSymbolKind } from '../../src/model/angular-kinds.js';
import type { AnalysisResult } from '../../src/model/types.js';

function makeResult(): AnalysisResult {
  return {
    meta: {
      analyzedAt: '2026-04-01T10:00:00.000Z',
      projectRoot: '/project',
      target: '@test/pkg',
      duration: 1000,
      projectFiles: 10,
    },
    packages: [
      {
        name: '@test/pkg',
        version: '1.0.0',
        entryPoints: [
          {
            path: '@test/pkg',
            symbols: [
              {
                name: 'HighRefSymbol',
                kind: AngularSymbolKind.Component,
                imported: true,
                used: true,
                usage: {
                  symbol: { name: 'HighRefSymbol', kind: AngularSymbolKind.Component, entryPoint: '@test/pkg', packageName: '@test/pkg' },
                  importedIn: [{ filePath: '/a.ts', line: 1, column: 0 }],
                  usedIn: [{ filePath: '/a.ts', line: 5, column: 0, context: 'code' }],
                  referenceCount: 10,
                  usageKind: 'runtime',
                },
              },
              {
                name: 'LowRefSymbol',
                kind: AngularSymbolKind.Service,
                imported: true,
                used: true,
                usage: {
                  symbol: { name: 'LowRefSymbol', kind: AngularSymbolKind.Service, entryPoint: '@test/pkg', packageName: '@test/pkg' },
                  importedIn: [{ filePath: '/b.ts', line: 1, column: 0 }],
                  usedIn: [{ filePath: '/b.ts', line: 5, column: 0, context: 'code' }],
                  referenceCount: 2,
                  usageKind: 'runtime',
                },
              },
              {
                name: 'UnusedSymbol',
                kind: AngularSymbolKind.Class,
                imported: false,
                used: false,
              },
            ],
          },
        ],
        summary: { totalExports: 3, used: 2, unused: 1, usageRatio: 2 / 3 },
      },
    ],
    summary: { totalPackages: 1, totalExports: 3, totalUsed: 2, totalUnused: 1, usageRatio: 2 / 3 },
  };
}

describe('markdown-reporter minRefs filter', () => {
  it('filters used symbols by minRefs', () => {
    const md = toMarkdown(makeResult(), { minRefs: 5 });

    // HighRefSymbol (10 refs) should be shown
    expect(md).toContain('HighRefSymbol');
    // LowRefSymbol (2 refs) should be filtered out from used section
    expect(md).not.toContain('LowRefSymbol');
  });

  it('still shows unused symbols when minRefs is set', () => {
    const md = toMarkdown(makeResult(), { minRefs: 5 });

    // Unused symbols are not affected by minRefs
    expect(md).toContain('UnusedSymbol');
  });

  it('keeps correct header totals regardless of minRefs', () => {
    const md = toMarkdown(makeResult(), { minRefs: 5 });

    // Header should show original counts (2/3 used), not filtered counts
    expect(md).toContain('2/3 used');
  });
});
