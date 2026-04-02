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
    // Sort entry points: those with used symbols first, by usage ratio descending
    const sortedEntryPoints = [...pkg.entryPoints].sort((a, b) => {
      const aUsed = a.symbols.filter((s) => s.used).length;
      const bUsed = b.symbols.filter((s) => s.used).length;
      if (aUsed > 0 && bUsed === 0) return -1;
      if (aUsed === 0 && bUsed > 0) return 1;
      const aRatio = a.symbols.length > 0 ? aUsed / a.symbols.length : 0;
      const bRatio = b.symbols.length > 0 ? bUsed / b.symbols.length : 0;
      return bRatio - aRatio;
    });

    for (const ep of sortedEntryPoints) {
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

      // Single table: used first (green), then unused (red)
      const showUsed = !options.unusedOnly;
      const showUnused = !options.usedOnly;

      const allRows: { cells: string[]; gutter: string }[] = [];

      if (showUsed) {
        for (const s of usedSymbols.sort(sortFn)) {
          allRows.push({
            cells: [
              s.name,
              s.kind,
              String(s.usage?.referenceCount ?? 0),
              String(s.usage?.importedIn.length ?? 0),
            ],
            gutter: chalk.green('▌'),
          });
        }
      }

      if (showUnused) {
        for (const s of unusedSymbols.sort(sortFn)) {
          allRows.push({
            cells: [s.name, s.kind, chalk.dim('–'), chalk.dim('–')],
            gutter: chalk.red('▌'),
          });
        }
      }

      if (allRows.length > 0) {
        lines.push(renderMixedTable(['Symbol', 'Kind', 'Refs', 'Files'], allRows));
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function renderMixedTable(
  headers: string[],
  rows: { cells: string[]; gutter: string }[],
): string {
  const colCount = headers.length;
  const widths = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      // Strip ANSI codes for width calculation
      const plain = (row.cells[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '');
      widths[i] = Math.max(widths[i], plain.length);
    }
  }

  const g = chalk.dim('▌');
  const headerLine =
    `  ${g} ` +
    headers.map((h, i) => chalk.dim(h.padEnd(widths[i]))).join(chalk.dim('  '));

  const separator =
    `  ${g} ` +
    widths.map((w) => chalk.dim('─'.repeat(w))).join(chalk.dim('──'));

  const dataLines = rows.map((row) => {
    const cells = row.cells.map((cell, i) => {
      const plain = cell.replace(/\x1b\[[0-9;]*m/g, '');
      const pad = widths[i] - plain.length;
      return cell + ' '.repeat(Math.max(0, pad));
    });
    return `  ${row.gutter} ` + cells.join('  ');
  });

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
