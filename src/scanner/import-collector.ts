import { Project, SyntaxKind } from 'ts-morph';
import path from 'node:path';
import type { CollectedImport } from '../model/types.js';
import type { Logger } from '../utils/logger.js';

/**
 * Create a ts-morph Project from the user's tsconfig for scanning source files.
 */
export function createScannerProject(
  projectRoot: string,
  tsConfigPath: string,
  includeTests: boolean,
  excludePatterns: string[],
): Project {
  const resolvedTsConfig = path.resolve(projectRoot, tsConfigPath);

  const project = new Project({
    tsConfigFilePath: resolvedTsConfig,
    skipAddingFilesFromTsConfig: false,
  });

  // Remove files matching exclude patterns and optionally test files
  const sourceFiles = project.getSourceFiles();
  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();

    // Always exclude node_modules and dist
    if (filePath.includes('/node_modules/') || filePath.includes('/dist/')) {
      project.removeSourceFile(sourceFile);
      continue;
    }

    // Exclude test files unless includeTests is true
    if (!includeTests && /\.spec\.ts$|\.test\.ts$|__tests__/.test(filePath)) {
      project.removeSourceFile(sourceFile);
      continue;
    }

    // Apply custom exclude patterns
    if (excludePatterns.some((pattern) => filePath.includes(pattern))) {
      project.removeSourceFile(sourceFile);
    }
  }

  return project;
}

/**
 * Collect all imports from the project's source files that match the target packages.
 */
export function collectImports(
  project: Project,
  targetPackages: Set<string>,
  logger: Logger,
): CollectedImport[] {
  const collected: CollectedImport[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();

    // Process ImportDeclarations
    const importDecls = sourceFile.getImportDeclarations();
    for (const importDecl of importDecls) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (!matchesTarget(moduleSpecifier, targetPackages)) continue;

      const isTypeOnly = importDecl.isTypeOnly();

      // Named imports: import { A, B } from 'pkg'
      const namedImports = importDecl.getNamedImports();
      for (const named of namedImports) {
        collected.push({
          symbolName: named.getName(),
          moduleSpecifier,
          filePath,
          line: named.getStartLineNumber(),
          column: named.getStartLineNumber() > 1
            ? named.getStart() - sourceFile.getFullText().lastIndexOf('\n', named.getStart() - 1) - 1
            : named.getStart(),
          isTypeOnly: isTypeOnly || named.isTypeOnly(),
          isReExport: false,
        });
      }

      // Default import: import X from 'pkg'
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        collected.push({
          symbolName: 'default',
          moduleSpecifier,
          filePath,
          line: defaultImport.getStartLineNumber(),
          column: 0,
          isTypeOnly,
          isReExport: false,
        });
      }

      // Namespace import: import * as X from 'pkg'
      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        collected.push({
          symbolName: '*',
          moduleSpecifier,
          filePath,
          line: namespaceImport.getStartLineNumber(),
          column: 0,
          isTypeOnly,
          isReExport: false,
          isNamespaceImport: true,
          namespaceAlias: namespaceImport.getText(),
        });
      }
    }

    // Process ExportDeclarations (re-exports): export { A } from 'pkg'
    const exportDecls = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDecls) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();
      if (!moduleSpecifier || !matchesTarget(moduleSpecifier, targetPackages)) continue;

      const isTypeOnly = exportDecl.isTypeOnly();

      const namedExports = exportDecl.getNamedExports();
      for (const named of namedExports) {
        collected.push({
          symbolName: named.getName(),
          moduleSpecifier,
          filePath,
          line: named.getStartLineNumber(),
          column: 0,
          isTypeOnly: isTypeOnly || named.isTypeOnly(),
          isReExport: true,
        });
      }
    }
  }

  return collected;
}

/**
 * Check if a module specifier matches any of the target packages.
 * Handles both exact matches and sub-entry-points.
 * e.g. "@angular/cdk" matches "@angular/cdk" and "@angular/cdk/overlay"
 */
function matchesTarget(moduleSpecifier: string, targetPackages: Set<string>): boolean {
  if (targetPackages.has(moduleSpecifier)) return true;

  // Check if it's a sub-entry-point of a target
  for (const target of targetPackages) {
    if (moduleSpecifier.startsWith(target + '/')) return true;
  }
  return false;
}

/**
 * Track imports through local barrel re-exports.
 *
 * If `barrel.ts` does `export { Foo } from '@pkg'` (already in `directImports`)
 * and `consumer.ts` does `import { Foo } from './barrel'`,
 * this function adds an additional CollectedImport for `Foo` attributed to `@pkg`.
 */
export function collectBarrelImports(
  project: Project,
  directImports: CollectedImport[],
  logger: Logger,
): CollectedImport[] {
  // Step 1: Build a map of barrel file paths → { symbolName → original moduleSpecifier }
  const reExports = directImports.filter((i) => i.isReExport);
  if (reExports.length === 0) return [];

  const barrelMap = new Map<string, Map<string, string>>();
  for (const re of reExports) {
    const symbols = barrelMap.get(re.filePath) ?? new Map<string, string>();
    symbols.set(re.symbolName, re.moduleSpecifier);
    barrelMap.set(re.filePath, symbols);
  }

  // Step 2: Find imports from barrel files in other project files
  const additional: CollectedImport[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const resolvedModule = importDecl.getModuleSpecifierSourceFile();
      if (!resolvedModule) continue;

      const resolvedPath = resolvedModule.getFilePath();
      const barrelSymbols = barrelMap.get(resolvedPath);
      if (!barrelSymbols) continue;

      const isTypeOnly = importDecl.isTypeOnly();

      for (const named of importDecl.getNamedImports()) {
        const symbolName = named.getName();
        const originalModule = barrelSymbols.get(symbolName);
        if (!originalModule) continue;

        logger.verbose(
          `  Barrel import: ${symbolName} from ${importDecl.getModuleSpecifierValue()} → ${originalModule}`,
        );

        additional.push({
          symbolName,
          moduleSpecifier: originalModule,
          filePath: sourceFile.getFilePath(),
          line: named.getStartLineNumber(),
          column: 0,
          isTypeOnly: isTypeOnly || named.isTypeOnly(),
          isReExport: false,
        });
      }
    }
  }

  return additional;
}

/** Get the count of source files in a scanner project */
export function getProjectFileCount(project: Project): number {
  return project.getSourceFiles().length;
}
