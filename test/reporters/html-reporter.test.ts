import { describe, it, expect } from 'vitest';
import { toHtml } from '../../src/reporters/html-reporter.js';
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
                  symbol: { name: 'UsedComp', kind: AngularSymbolKind.Component, entryPoint: '@test/pkg', packageName: '@test/pkg' },
                  importedIn: [{ filePath: '/src/app.ts', line: 1, column: 1 }],
                  usedIn: [{ filePath: '/src/app.ts', line: 5, column: 1, context: 'code' }],
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
        summary: { totalExports: 2, used: 1, unused: 1, usageRatio: 0.5 },
      },
    ],
    summary: { totalPackages: 1, totalExports: 2, totalUsed: 1, totalUnused: 1, usageRatio: 0.5 },
  };
}

describe('html-reporter', () => {
  it('generates valid HTML with required elements', () => {
    const html = toHtml(makeResult());

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Usage Report: @test/pkg</title>');
    expect(html).toContain('42 files scanned');
  });

  it('includes SVG donut chart', () => {
    const html = toHtml(makeResult());
    expect(html).toContain('<svg class="donut"');
    expect(html).toContain('50.0%');
    expect(html).toContain('1/2 used');
  });

  it('includes filter controls', () => {
    const html = toHtml(makeResult());
    expect(html).toContain('id="search"');
    expect(html).toContain('id="filterKind"');
    expect(html).toContain('id="filterStatus"');
  });

  it('includes symbol rows with data attributes', () => {
    const html = toHtml(makeResult());
    expect(html).toContain('data-symbol="UsedComp"');
    expect(html).toContain('data-symbol="UnusedSvc"');
    expect(html).toContain('data-status="used"');
    expect(html).toContain('data-status="unused"');
  });

  it('includes embedded JSON data for export', () => {
    const html = toHtml(makeResult());
    expect(html).toContain('<script type="application/json" id="report-data">');
    expect(html).toContain('downloadJson()');
  });

  it('includes expandable details with file paths', () => {
    const html = toHtml(makeResult());
    expect(html).toContain('/src/app.ts:1');
    expect(html).toContain('toggleDetails');
  });
});
