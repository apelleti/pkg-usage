import chalk from 'chalk';
import type { AnalysisResult, SymbolAnalysis } from '../model/types.js';

export interface ConsoleOptions {
  unusedOnly?: boolean;
  usedOnly?: boolean;
  summaryOnly?: boolean;
  sort?: 'name' | 'kind' | 'refs';
  minRefs?: number;
}

export function toConsole(
  result: AnalysisResult,
  options: ConsoleOptions = {},
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold(`  Usage Report: ${result.meta.target}`));
  lines.push(
    chalk.dim(
      `  ${result.meta.analyzedAt.split('T')[0]} • ` +
      `${result.meta.projectFiles} files scanned • ` +
      `${(result.meta.duration / 1000).toFixed(1)}s`,
    ),
  );
  lines.push('');

  // Summary
  const s = result.summary;
  const usedPct = pct(s.usageRatio);
  const unusedPct = pct(1 - s.usageRatio);
  lines.push(
    `  ${chalk.dim('Packages')} ${chalk.bold(String(s.totalPackages))}` +
    `    ${chalk.dim('Exports')} ${chalk.bold(String(s.totalExports))}` +
    `    ${chalk.green(`Used ${s.totalUsed} (${usedPct})`)}` +
    `    ${chalk.red(`Unused ${s.totalUnused} (${unusedPct})`)}`,
  );
  lines.push('');

  if (options.summaryOnly) {
    return lines.join('\n');
  }

  for (const pkg of result.packages) {
    for (const ep of pkg.entryPoints) {
      const total = ep.symbols.length;
      const usedCount = ep.symbols.filter((s) => s.used).length;
      const ratio = total > 0 ? usedCount / total : 0;

      let usedSymbols = ep.symbols.filter((s) => s.used);
      const unusedSymbols = ep.symbols.filter((s) => !s.used);

      if (options.minRefs) {
        usedSymbols = usedSymbols.filter(
          (s) => (s.usage?.referenceCount ?? 0) >= options.minRefs!,
        );
      }

      const sortFn = getSortFn(options.sort);

      lines.push(
        chalk.bold(`  ${ep.path}`) +
        chalk.dim(` — ${usedCount}/${total} used (${pct(ratio)})`),
      );
      lines.push('');

      // Used
      if (!options.unusedOnly && usedSymbols.length > 0) {
        const rows = usedSymbols.sort(sortFn).map((s) => [
          s.name,
          s.kind,
          String(s.usage?.referenceCount ?? 0),
          String(s.usage?.importedIn.length ?? 0),
        ]);
        lines.push(
          renderTable(
            ['Symbol', 'Kind', 'Refs', 'Files'],
            rows,
            chalk.green('▌'),
          ),
        );
        lines.push('');
      }

      // Unused
      if (!options.usedOnly && unusedSymbols.length > 0) {
        const rows = unusedSymbols.sort(sortFn).map((s) => [s.name, s.kind]);
        lines.push(
          renderTable(
            ['Symbol', 'Kind'],
            rows,
            chalk.red('▌'),
          ),
        );
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function renderTable(
  headers: string[],
  rows: string[][],
  gutter: string,
): string {
  const colCount = headers.length;
  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      widths[i] = Math.max(widths[i], (row[i] ?? '').length);
    }
  }

  const headerLine =
    `  ${gutter} ` +
    headers.map((h, i) => chalk.dim(h.padEnd(widths[i]))).join(chalk.dim('  '));

  const separator =
    `  ${gutter} ` +
    widths.map((w) => chalk.dim('─'.repeat(w))).join(chalk.dim('──'));

  const dataLines = rows.map(
    (row) =>
      `  ${gutter} ` +
      row.map((cell, i) => cell.padEnd(widths[i])).join('  '),
  );

  return [headerLine, separator, ...dataLines].join('\n');
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
