import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { UsageLocation } from '../model/types.js';
import type { Logger } from '../utils/logger.js';

export interface ScssUsage {
  packageName: string;
  location: UsageLocation;
}

/**
 * Scan SCSS/SASS files for @use and @import statements referencing target packages.
 */
export async function scanScssFiles(
  projectRoot: string,
  targetPackages: Set<string>,
  exclude: string[],
  logger: Logger,
): Promise<ScssUsage[]> {
  const scssFiles = await findScssFiles(projectRoot, exclude);
  if (scssFiles.length === 0) return [];

  logger.verbose(`Found ${scssFiles.length} SCSS/SASS files`);
  const usages: ScssUsage[] = [];

  for (const filePath of scssFiles) {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match @use 'pkg' or @use "pkg"
      const useMatch = line.match(/@use\s+['"]([^'"]+)['"]/);
      if (useMatch) {
        const pkg = useMatch[1];
        if (matchesPackage(pkg, targetPackages)) {
          usages.push({
            packageName: resolvePackageName(pkg, targetPackages),
            location: {
              filePath,
              line: i + 1,
              column: line.indexOf('@use'),
              context: 'scss-import',
            },
          });
        }
      }

      // Match @import 'pkg' or @import "pkg"
      const importMatch = line.match(/@import\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        const pkg = importMatch[1];
        if (matchesPackage(pkg, targetPackages)) {
          usages.push({
            packageName: resolvePackageName(pkg, targetPackages),
            location: {
              filePath,
              line: i + 1,
              column: line.indexOf('@import'),
              context: 'scss-import',
            },
          });
        }
      }
    }
  }

  return usages;
}

function matchesPackage(specifier: string, targetPackages: Set<string>): boolean {
  // Remove leading ~ (webpack convention)
  const cleaned = specifier.startsWith('~') ? specifier.slice(1) : specifier;
  if (targetPackages.has(cleaned)) return true;
  for (const pkg of targetPackages) {
    if (cleaned.startsWith(pkg + '/')) return true;
  }
  return false;
}

function resolvePackageName(specifier: string, targetPackages: Set<string>): string {
  const cleaned = specifier.startsWith('~') ? specifier.slice(1) : specifier;
  if (targetPackages.has(cleaned)) return cleaned;
  for (const pkg of targetPackages) {
    if (cleaned.startsWith(pkg + '/')) return pkg;
  }
  return cleaned;
}

async function findScssFiles(
  dir: string,
  exclude: string[],
  results: string[] = [],
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules, dist, and excluded patterns
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    if (exclude.some((pattern) => fullPath.includes(pattern))) {
      continue;
    }

    if (entry.isDirectory()) {
      await findScssFiles(fullPath, exclude, results);
    } else if (/\.s[ac]ss$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}
