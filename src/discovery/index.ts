import type { ExportedSymbol, PackageInfo } from '../model/types.js';
import type { Logger } from '../utils/logger.js';
import { resolveTarget } from './scope-resolver.js';
import { resolvePackageEntryPoints } from './entry-point-resolver.js';
import { createDiscoveryProject, addAndParseDeclarationFile } from './dts-parser.js';
import { classifyAngularSymbols } from './angular-classifier.js';

export { isScope, isSubEntryPoint, resolveTarget } from './scope-resolver.js';
export { resolvePackageEntryPoints } from './entry-point-resolver.js';
export { createDiscoveryProject, parseDeclarationFile, addAndParseDeclarationFile } from './dts-parser.js';
export { classifyAngularSymbols } from './angular-classifier.js';

export interface DiscoveryResult {
  packages: PackageInfo[];
  symbols: ExportedSymbol[];
}

/**
 * Discover all public exports for a given target (package, scope, or sub-entry-point).
 */
export async function discoverExports(
  target: string,
  projectRoot: string,
  logger: Logger,
): Promise<DiscoveryResult> {
  const spinner = logger.spinner(`Discovering exports for ${target}...`);
  spinner.start();

  try {
    const packageNames = await resolveTarget(target, projectRoot);
    logger.verbose(`Resolved target "${target}" to ${packageNames.length} package(s)`);

    const project = createDiscoveryProject();
    const packages: PackageInfo[] = [];
    const allSymbols: ExportedSymbol[] = [];

    for (const packageName of packageNames) {
      logger.verbose(`Processing package: ${packageName}`);
      const packageInfo = await resolvePackageEntryPoints(
        packageName,
        projectRoot,
        logger,
        target,
      );

      for (const entryPoint of packageInfo.entryPoints) {
        logger.verbose(`  Parsing entry point: ${entryPoint.path} → ${entryPoint.dtsPath}`);
        const symbols = addAndParseDeclarationFile(
          project,
          entryPoint.dtsPath,
          entryPoint.path,
          packageName,
        );
        allSymbols.push(...symbols);
      }

      packages.push(packageInfo);
    }

    // Classify Angular symbols
    spinner.text = 'Classifying Angular symbols...';
    classifyAngularSymbols(allSymbols, project);

    spinner.succeed(
      `Found ${allSymbols.length} exports across ${packages.length} package(s)`,
    );

    return { packages, symbols: allSymbols };
  } catch (error) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
