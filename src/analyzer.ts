import type {
  AnalyzeOptions,
  AnalysisResult,
  PackageAnalysis,
  EntryPointAnalysis,
  SymbolAnalysis,
} from './model/types.js';
import { discoverExports } from './discovery/index.js';
import { scanUsages } from './scanner/index.js';
import { scanScssFiles } from './scanner/scss-scanner.js';
import { createLogger, type Logger } from './utils/logger.js';

export async function analyze(
  options: AnalyzeOptions,
  logger?: Logger,
): Promise<AnalysisResult> {
  const log = logger ?? createLogger();
  const startTime = Date.now();

  // Step 1: Discover exports
  const discovery = await discoverExports(
    options.target,
    options.projectRoot,
    log,
  );

  // Step 2: Scan usages
  const targetPackages = new Set(discovery.packages.map((p) => p.name));
  const scanResult = scanUsages(
    {
      projectRoot: options.projectRoot,
      tsConfigPath: options.tsConfigPath ?? './tsconfig.json',
      includeTypes: options.includeTypes ?? false,
      includeTests: options.includeTests ?? false,
      exclude: options.exclude ?? [],
      deep: options.deep ?? false,
    },
    discovery.symbols,
    targetPackages,
    log,
  );

  // Step 2b: Scan SCSS files
  const scssUsages = await scanScssFiles(
    options.projectRoot,
    targetPackages,
    options.exclude ?? [],
    log,
  );
  // Merge SCSS usages into the usage map — mark the package as "used" at the entry-point level
  for (const scss of scssUsages) {
    // Find any exported symbol from this package to mark as used
    const matchingSymbol = discovery.symbols.find(
      (s) => s.packageName === scss.packageName,
    );
    if (matchingSymbol) {
      const usageKey = `${matchingSymbol.packageName}::__scss_import__`;
      if (!scanResult.usageMap.has(usageKey)) {
        scanResult.usageMap.set(usageKey, {
          symbol: { ...matchingSymbol, name: '__scss_import__' },
          importedIn: [scss.location],
          usedIn: [scss.location],
          referenceCount: 1,
          usageKind: 'runtime',
        });
      }
    }
  }

  // Step 3: Build result
  const packages: PackageAnalysis[] = discovery.packages.map((pkg) => {
    const entryPoints: EntryPointAnalysis[] = pkg.entryPoints.map((ep) => {
      const epSymbols = discovery.symbols.filter(
        (s) => s.entryPoint === ep.path && s.packageName === pkg.name,
      );

      const symbols: SymbolAnalysis[] = epSymbols.map((s) => {
        const usageKey = `${s.packageName}::${s.name}`;
        const usage = scanResult.usageMap.get(usageKey);
        const imported = !!usage;

        // For MVP: imported + (not type-only OR includeTypes) = used
        let used = false;
        if (usage) {
          if (options.includeTypes) {
            used = true;
          } else {
            used = usage.usageKind === 'runtime' || usage.usageKind === 'both';
          }
        }

        return {
          name: s.name,
          kind: s.kind,
          imported,
          used,
          ...(usage ? { usage } : {}),
        };
      });

      return { path: ep.path, symbols };
    });

    const allSymbols = entryPoints.flatMap((ep) => ep.symbols);
    const usedCount = allSymbols.filter((s) => s.used).length;
    const totalCount = allSymbols.length;

    return {
      name: pkg.name,
      version: pkg.version,
      entryPoints,
      summary: {
        totalExports: totalCount,
        used: usedCount,
        unused: totalCount - usedCount,
        usageRatio: totalCount > 0 ? usedCount / totalCount : 0,
      },
    };
  });

  const allSymbols = packages.flatMap((p) =>
    p.entryPoints.flatMap((ep) => ep.symbols),
  );
  const totalExports = allSymbols.length;
  const totalUsed = allSymbols.filter((s) => s.used).length;

  return {
    meta: {
      analyzedAt: new Date().toISOString(),
      projectRoot: options.projectRoot,
      target: options.target,
      duration: Date.now() - startTime,
      projectFiles: scanResult.projectFileCount,
    },
    packages,
    summary: {
      totalPackages: packages.length,
      totalExports,
      totalUsed,
      totalUnused: totalExports - totalUsed,
      usageRatio: totalExports > 0 ? totalUsed / totalExports : 0,
    },
  };
}
