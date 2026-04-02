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
      duration: 1500,
      projectFiles: 42,
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
                name: 'UsedComp',
                kind: AngularSymbolKind.Component,
                imported: true,
                used: true,
                usage: {
                  symbol: {
                    name: 'UsedComp',
                    kind: AngularSymbolKind.Component,
                    entryPoint: '@test/pkg',
                    packageName: '@test/pkg',
                  },
                  importedIn: [{ filePath: '/src/app.ts', line: 1, column: 1 }],
                  usedIn: [
                    {
                      filePath: '/src/app.ts',
                      line: 5,
                      column: 1,
                      context: 'code',
                    },
                  ],
                  referenceCount: 3,
                  usageKind: 'runtime',
                },
              },
              {
                name: 'UnusedSvc',
                kind: AngularSymbolKind.Service,
                imported: false,
                used: false,
              },
            ],
          },
        ],
        summary: {
          totalExports: 2,
          used: 1,
          unused: 1,
          usageRatio: 0.5,
        },
      },
    ],
    summary: {
      totalPackages: 1,
      totalExports: 2,
      totalUsed: 1,
      totalUnused: 1,
      usageRatio: 0.5,
    },
  };
}

describe('markdown-reporter', () => {
  it('generates a valid markdown report', () => {
    const md = toMarkdown(makeResult());

    expect(md).toContain('# Usage Report: @test/pkg');
    expect(md).toContain('42 project files scanned');
    expect(md).toContain('1.5s');
    expect(md).toContain('| Used     | 1 (50.0%)');
    expect(md).toContain('### ✅ Used (1)');
    expect(md).toContain('| UsedComp | component |');
    expect(md).toContain('### ❌ Unused (1)');
    expect(md).toContain('| UnusedSvc | service |');
  });

  it('supports summaryOnly option', () => {
    const md = toMarkdown(makeResult(), { summaryOnly: true });

    expect(md).toContain('## Summary');
    expect(md).not.toContain('### ✅ Used');
    expect(md).not.toContain('### ❌ Unused');
  });

  it('supports unusedOnly option', () => {
    const md = toMarkdown(makeResult(), { unusedOnly: true });

    expect(md).not.toContain('### ✅ Used');
    expect(md).toContain('### ❌ Unused');
  });

  it('supports usedOnly option', () => {
    const md = toMarkdown(makeResult(), { usedOnly: true });

    expect(md).toContain('### ✅ Used');
    expect(md).not.toContain('### ❌ Unused');
  });
});
