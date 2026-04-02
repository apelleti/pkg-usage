import path from 'node:path';
import type { PackageInfo, EntryPoint } from '../model/types.js';
import { readPackageJson, type PackageJson } from '../utils/package-json.js';
import { resolvePackagePath, pathExists } from '../utils/path-resolver.js';
import { getSubPath, isSubEntryPoint } from './scope-resolver.js';
import type { Logger } from '../utils/logger.js';

/**
 * Resolve a condition value from an exports entry.
 * Handles nested objects like { "types": "./x.d.ts", "default": "./x.js" }
 * and plain strings like "./index.js".
 */
function resolveTypesFromCondition(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // Prefer "types" condition
    if (typeof obj['types'] === 'string') {
      return obj['types'];
    }
    // Fallback to "default"
    if (typeof obj['default'] === 'string') {
      return obj['default'];
    }
    // Try "import" condition (may have nested types)
    if (obj['import'] && typeof obj['import'] === 'object') {
      return resolveTypesFromCondition(obj['import']);
    }
    if (typeof obj['import'] === 'string') {
      return obj['import'];
    }
  }
  return null;
}

/** Convert a .js path to a .d.ts path */
function toDtsPath(filePath: string): string {
  return filePath
    .replace(/\.js$/, '.d.ts')
    .replace(/\.mjs$/, '.d.mts')
    .replace(/\.cjs$/, '.d.cts');
}

/**
 * Parse the "exports" field of package.json to find entry points with .d.ts files.
 */
async function resolveFromExportsField(
  exportsField: Record<string, unknown>,
  packageDir: string,
  logger: Logger,
): Promise<EntryPoint[]> {
  const entryPoints: EntryPoint[] = [];

  for (const [key, value] of Object.entries(exportsField)) {
    // Skip non-subpath keys (e.g. "require", "import" at top level)
    if (!key.startsWith('.')) continue;

    // Skip internal entry points
    if (key.includes('/internal') || key.includes('/_')) continue;

    const resolved = resolveTypesFromCondition(value);
    if (!resolved) {
      logger.verbose(`  Skipping export "${key}": no types/default condition found`);
      continue;
    }

    let dtsFile = resolved;
    if (!dtsFile.endsWith('.d.ts') && !dtsFile.endsWith('.d.mts') && !dtsFile.endsWith('.d.cts')) {
      dtsFile = toDtsPath(dtsFile);
    }

    const dtsPath = path.resolve(packageDir, dtsFile);
    if (await pathExists(dtsPath)) {
      entryPoints.push({ path: key, dtsPath });
    } else {
      logger.verbose(`  Skipping export "${key}": .d.ts not found at ${dtsPath}`);
    }
  }

  return entryPoints;
}

/**
 * Fallback: resolve entry point from types/typings/index.d.ts
 */
async function resolveFromFallback(
  packageDir: string,
  pkgJson: PackageJson,
  logger: Logger,
): Promise<EntryPoint[]> {
  // Try types or typings field
  const typesField = pkgJson.types || pkgJson.typings;
  if (typeof typesField === 'string') {
    const dtsPath = path.resolve(packageDir, typesField);
    if (await pathExists(dtsPath)) {
      return [{ path: '.', dtsPath }];
    }
  }

  // Try index.d.ts at package root
  const indexDts = path.join(packageDir, 'index.d.ts');
  if (await pathExists(indexDts)) {
    return [{ path: '.', dtsPath: indexDts }];
  }

  // Try main field converted to .d.ts
  if (typeof pkgJson.main === 'string') {
    const dtsPath = path.resolve(packageDir, toDtsPath(pkgJson.main));
    if (await pathExists(dtsPath)) {
      return [{ path: '.', dtsPath }];
    }
  }

  logger.warn(`  No type definitions found for ${pkgJson.name}`);
  return [];
}

/**
 * Resolve all entry points for a package, returning a PackageInfo.
 * If the original target is a sub-entry-point (e.g. "@angular/cdk/overlay"),
 * only that sub-entry-point is included.
 */
export async function resolvePackageEntryPoints(
  packageName: string,
  projectRoot: string,
  logger: Logger,
  originalTarget?: string,
): Promise<PackageInfo> {
  const packageDir = resolvePackagePath(packageName, projectRoot);
  if (!(await pathExists(packageDir))) {
    throw new Error(`Package not found in node_modules: ${packageName}`);
  }

  const pkgJson = await readPackageJson(packageDir);
  let entryPoints: EntryPoint[];

  if (pkgJson.exports && typeof pkgJson.exports === 'object') {
    logger.verbose(`  Resolving exports field for ${packageName}`);
    entryPoints = await resolveFromExportsField(
      pkgJson.exports as Record<string, unknown>,
      packageDir,
      logger,
    );

    // If exports field yielded nothing, fall back
    if (entryPoints.length === 0) {
      logger.verbose(`  Exports field empty, trying fallback for ${packageName}`);
      entryPoints = await resolveFromFallback(packageDir, pkgJson, logger);
    }
  } else {
    entryPoints = await resolveFromFallback(packageDir, pkgJson, logger);
  }

  // Filter to sub-entry-point if target is specific
  if (originalTarget && isSubEntryPoint(originalTarget)) {
    const subPath = getSubPath(originalTarget);
    const available = entryPoints.map((ep) => ep.path);
    entryPoints = entryPoints.filter((ep) => ep.path === subPath);
    if (entryPoints.length === 0) {
      throw new Error(
        `Entry point "${subPath}" not found in ${packageName}. ` +
        `Available: ${available.join(', ') || 'none'}`,
      );
    }
  }

  // Normalize entry point paths: "." → packageName, "./overlay" → packageName/overlay
  entryPoints = entryPoints.map((ep) => ({
    ...ep,
    path:
      ep.path === '.'
        ? packageName
        : `${packageName}/${ep.path.replace(/^\.\//, '')}`,
  }));

  return {
    name: packageName,
    version: (pkgJson.version as string) || 'unknown',
    packageDir,
    entryPoints,
  };
}
