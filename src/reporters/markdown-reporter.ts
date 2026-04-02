import type { AnalysisResult, SymbolAnalysis } from '../model/types.js';

export interface MarkdownOptions {
  unusedOnly?: boolean;
  usedOnly?: boolean;
  summaryOnly?: boolean;
  sort?: 'name' | 'kind' | 'refs';
  minRefs?: number;
}

export function toMarkdown(
  result: AnalysisResult,
  options: MarkdownOptions = {},
): string {
  const lines: string[] = [];

  lines.push(`# Usage Report: ${result.meta.target}`);
  lines.push('');
  lines.push(
    `> Analyzed on ${result.meta.analyzedAt.split('T')[0]} • ` +
    `${result.meta.projectFiles} project files scanned • ` +
    `Completed in ${(result.meta.duration / 1000).toFixed(1)}s`,
  );
  lines.push('');

  // Global summary
  lines.push('## Summary');
  lines.push('');
  lines.push(
    ...alignTable(
      ['Metric', 'Value'],
      [
        ['Packages', String(result.summary.totalPackages)],
        ['Exports', String(result.summary.totalExports)],
        ['Used', `${result.summary.totalUsed} (${pct(result.summary.usageRatio)})`],
        ['Unused', `${result.summary.totalUnused} (${pct(1 - result.summary.usageRatio)})`],
      ],
    ),
  );
  lines.push('');

  if (options.summaryOnly) {
    return lines.join('\n');
  }

  // Per-package, per-entry-point details
  for (const pkg of result.packages) {
    for (const ep of pkg.entryPoints) {
      // Header always uses unfiltered counts
      const total = ep.symbols.length;
      const usedCount = ep.symbols.filter((s) => s.used).length;
      const ratio = total > 0 ? usedCount / total : 0;

      // Separate used/unused, then apply minRefs filter to used only
      let usedSymbols = ep.symbols.filter((s) => s.used);
      const unusedSymbols = ep.symbols.filter((s) => !s.used);

      if (options.minRefs) {
        usedSymbols = usedSymbols.filter(
          (s) => (s.usage?.referenceCount ?? 0) >= options.minRefs!,
        );
      }

      lines.push(
        `## ${ep.path} (${usedCount}/${total} used — ${pct(ratio)})`,
      );
      lines.push('');

      const sortFn = getSortFn(options.sort);

      // Used symbols
      if (!options.unusedOnly && usedSymbols.length > 0) {
        lines.push(`### ✅ Used (${usedSymbols.length})`);
        lines.push('');
        const rows = usedSymbols.sort(sortFn).map((s) => [
          s.name,
          s.kind,
          String(s.usage?.referenceCount ?? 0),
          String(s.usage?.importedIn.length ?? 0),
        ]);
        lines.push(...alignTable(['Symbol', 'Kind', 'References', 'Files'], rows));
        lines.push('');
      }

      // Unused symbols
      if (!options.usedOnly && unusedSymbols.length > 0) {
        lines.push(`### ❌ Unused (${unusedSymbols.length})`);
        lines.push('');
        const rows = unusedSymbols.sort(sortFn).map((s) => [s.name, s.kind]);
        lines.push(...alignTable(['Symbol', 'Kind'], rows));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function getSortFn(
  sort?: 'name' | 'kind' | 'refs',
): (a: SymbolAnalysis, b: SymbolAnalysis) => number {
  switch (sort) {
    case 'kind':
      return (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);
    case 'refs':
      return (a, b) =>
        (b.usage?.referenceCount ?? 0) - (a.usage?.referenceCount ?? 0) ||
        a.name.localeCompare(b.name);
    case 'name':
    default:
      return (a, b) => a.name.localeCompare(b.name);
  }
}

/** Build a markdown table with columns padded to equal width */
function alignTable(headers: string[], rows: string[][]): string[] {
  const colCount = headers.length;
  const widths = headers.map((h) => h.length);

  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      widths[i] = Math.max(widths[i], (row[i] ?? '').length);
    }
  }

  const formatRow = (cells: string[]) =>
    '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';

  const separator =
    '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';

  return [
    formatRow(headers),
    separator,
    ...rows.map((r) => formatRow(r)),
  ];
}
