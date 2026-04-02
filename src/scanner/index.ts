import type { CollectedImport, ExportedSymbol, SymbolUsage } from '../model/types.js';
import type { Logger } from '../utils/logger.js';
import {
  createScannerProject,
  collectImports,
  collectBarrelImports,
  getProjectFileCount,
} from './import-collector.js';
import { trackUsages } from './usage-tracker.js';
import { collectDecoratorUsages } from './decorator-scanner.js';
import { scanTemplates } from './template-scanner.js';
import { scanDIUsages } from './di-scanner.js';

export { createScannerProject, collectImports, collectBarrelImports, getProjectFileCount } from './import-collector.js';
export { trackUsages } from './usage-tracker.js';
export { collectDecoratorUsages } from './decorator-scanner.js';
export { scanTemplates } from './template-scanner.js';
export { scanDIUsages } from './di-scanner.js';

export interface ScanResult {
  usageMap: Map<string, SymbolUsage>;
  collectedImports: CollectedImport[];
  projectFileCount: number;
}

export interface ScanOptions {
  projectRoot: string;
  tsConfigPath: string;
  includeTypes: boolean;
  includeTests: boolean;
  exclude: string[];
  deep: boolean;
}

/**
 * Scan the project for usages of the given exported symbols.
 */
export function scanUsages(
  options: ScanOptions,
  exportedSymbols: ExportedSymbol[],
  targetPackages: Set<string>,
  logger: Logger,
): ScanResult {
  const spinner = logger.spinner('Scanning project for imports...');
  spinner.start();

  try {
    const project = createScannerProject(
      options.projectRoot,
      options.tsConfigPath,
      options.includeTests,
      options.exclude,
    );

    const projectFileCount = getProjectFileCount(project);
    logger.verbose(`Scanning ${projectFileCount} source files`);

    spinner.text = 'Collecting imports...';
    const directImports = collectImports(project, targetPackages, logger);
    logger.verbose(`Found ${directImports.length} direct imports`);

    // Follow local barrel re-exports
    spinner.text = 'Following barrel re-exports...';
    const barrelImports = collectBarrelImports(project, directImports, logger);
    if (barrelImports.length > 0) {
      logger.verbose(`Found ${barrelImports.length} imports through local barrels`);
    }
    const collectedImports = [...directImports, ...barrelImports];

    // Scan decorator arrays (@Component imports/providers, @NgModule imports/providers)
    spinner.text = 'Scanning decorator usages...';
    const importedSymbolNames = new Set(collectedImports.map((i) => i.symbolName));
    const decoratorUsages = collectDecoratorUsages(project, importedSymbolNames);
    if (decoratorUsages.length > 0) {
      logger.verbose(`Found ${decoratorUsages.length} decorator usages`);
    }

    // Scan Angular templates for component selectors and pipe usages
    spinner.text = 'Scanning Angular templates...';
    const templateUsages = scanTemplates(project, exportedSymbols, logger);
    if (templateUsages.length > 0) {
      logger.verbose(`Found ${templateUsages.length} template usages`);
    }
    // Merge template usages into decorator usages (same shape)
    decoratorUsages.push(...templateUsages);

    // Scan DI usages (constructor injection of services)
    if (options.deep) {
      spinner.text = 'Scanning DI usages...';
      const diUsages = scanDIUsages(project, exportedSymbols, logger);
      if (diUsages.length > 0) {
        logger.verbose(`Found ${diUsages.length} DI constructor injection usages`);
        decoratorUsages.push(...diUsages);
      }
    }

    spinner.text = options.deep ? 'Deep tracking symbol usage...' : 'Tracking symbol usage...';
    const usageMap = trackUsages(
      collectedImports,
      exportedSymbols,
      options.includeTypes,
      decoratorUsages,
      options.deep,
      project,
    );

    spinner.succeed(
      `Scanned ${projectFileCount} files, found ${usageMap.size} used symbols${options.deep ? ' (deep)' : ''}`,
    );

    return { usageMap, collectedImports, projectFileCount };
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
