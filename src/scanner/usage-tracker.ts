import { type Project, SyntaxKind } from 'ts-morph';
import type {
  CollectedImport,
  ExportedSymbol,
  SymbolUsage,
  FileLocation,
  UsageLocation,
} from '../model/types.js';
import type { DecoratorUsage } from './decorator-scanner.js';

/**
 * Track usages by matching collected imports against discovered exports.
 * Returns a Map of symbol name → SymbolUsage.
 *
 * When `deep` is true, uses ts-morph findReferences for exact reference counting
 * and resolves namespace imports (import * as X → X.Foo).
 */
export function trackUsages(
  collectedImports: CollectedImport[],
  exportedSymbols: ExportedSymbol[],
  includeTypes: boolean,
  decoratorUsages: DecoratorUsage[] = [],
  deep = false,
  project?: Project,
): Map<string, SymbolUsage> {
  const usageMap = new Map<string, SymbolUsage>();

  // Separate namespace imports from named imports
  const namedImports = collectedImports.filter((i) => !i.isNamespaceImport);
  const namespaceImports = collectedImports.filter((i) => i.isNamespaceImport);

  // Group named imports by symbol name + module specifier
  const importsBySymbol = new Map<string, CollectedImport[]>();
  for (const imp of namedImports) {
    const key = `${imp.symbolName}::${imp.moduleSpecifier}`;
    const list = importsBySymbol.get(key) ?? [];
    list.push(imp);
    importsBySymbol.set(key, list);
  }

  // Resolve namespace imports: find X.Foo usages in code
  if (namespaceImports.length > 0 && project) {
    const resolved = resolveNamespaceUsages(namespaceImports, exportedSymbols, project);
    for (const imp of resolved) {
      const key = `${imp.symbolName}::${imp.moduleSpecifier}`;
      const list = importsBySymbol.get(key) ?? [];
      list.push(imp);
      importsBySymbol.set(key, list);
    }
  }

  // Match against exported symbols
  for (const symbol of exportedSymbols) {
    const matchingImports = findMatchingImports(symbol, importsBySymbol);

    if (matchingImports.length === 0) continue;

    const hasRuntimeImport = matchingImports.some((i) => !i.isTypeOnly);
    const hasTypeOnlyImport = matchingImports.some((i) => i.isTypeOnly);

    let usageKind: 'runtime' | 'type-only' | 'both';
    if (hasRuntimeImport && hasTypeOnlyImport) {
      usageKind = 'both';
    } else if (hasRuntimeImport) {
      usageKind = 'runtime';
    } else {
      usageKind = 'type-only';
    }

    const importedIn: FileLocation[] = matchingImports.map((i) => ({
      filePath: i.filePath,
      line: i.line,
      column: i.column,
    }));

    const usedIn: UsageLocation[] = matchingImports
      .filter((i) => includeTypes || !i.isTypeOnly)
      .map((i) => ({
        filePath: i.filePath,
        line: i.line,
        column: i.column,
        context: 'code' as const,
      }));

    // Add decorator usages
    const symbolDecoratorUsages = decoratorUsages.filter(
      (d) => d.symbolName === symbol.name,
    );
    for (const du of symbolDecoratorUsages) {
      usedIn.push(du.location);
    }

    // Deep reference counting — use max of deep refs and usedIn count
    // because template/decorator usages aren't visible to findReferences
    let referenceCount = usedIn.length;
    if (deep && project) {
      const deepRefs = countDeepReferences(symbol.name, matchingImports, project);
      referenceCount = Math.max(deepRefs, usedIn.length);
    }

    usageMap.set(`${symbol.packageName}::${symbol.name}`, {
      symbol,
      importedIn,
      usedIn,
      referenceCount,
      usageKind,
    });
  }

  return usageMap;
}

/**
 * Find imports matching a given exported symbol.
 */
function findMatchingImports(
  symbol: ExportedSymbol,
  importsBySymbol: Map<string, CollectedImport[]>,
): CollectedImport[] {
  const results: CollectedImport[] = [];

  for (const [key, imports] of importsBySymbol) {
    const [symbolName, moduleSpecifier] = key.split('::');
    if (symbolName !== symbol.name) continue;

    if (
      moduleSpecifier === symbol.entryPoint ||
      symbol.entryPoint.startsWith(moduleSpecifier + '/') ||
      moduleSpecifier.startsWith(symbol.entryPoint.split('/').slice(0, -1).join('/') + '/')
    ) {
      results.push(...imports);
    }
  }

  return results;
}

/**
 * Resolve namespace imports (import * as X from 'pkg') by finding
 * property access expressions X.Foo in the source files.
 */
function resolveNamespaceUsages(
  namespaceImports: CollectedImport[],
  exportedSymbols: ExportedSymbol[],
  project: Project,
): CollectedImport[] {
  const resolved: CollectedImport[] = [];
  const exportedNames = new Set(exportedSymbols.map((s) => s.name));

  for (const nsImport of namespaceImports) {
    const alias = nsImport.namespaceAlias!;
    const sourceFile = project.getSourceFile(nsImport.filePath);
    if (!sourceFile) continue;

    // Find all PropertyAccessExpression nodes where the object is the alias
    const propertyAccesses = sourceFile.getDescendantsOfKind(
      SyntaxKind.PropertyAccessExpression,
    );

    for (const access of propertyAccesses) {
      const obj = access.getExpression();
      if (obj.getText() !== alias) continue;

      const propertyName = access.getName();
      if (!exportedNames.has(propertyName)) continue;

      resolved.push({
        symbolName: propertyName,
        moduleSpecifier: nsImport.moduleSpecifier,
        filePath: nsImport.filePath,
        line: access.getStartLineNumber(),
        column: 0,
        isTypeOnly: nsImport.isTypeOnly,
        isReExport: false,
      });
    }
  }

  return resolved;
}

/**
 * Count exact references to a symbol across the project using ts-morph findReferences.
 * Only needs to call findReferences once from any identifier — it returns ALL references
 * across the entire project.
 */
function countDeepReferences(
  symbolName: string,
  matchingImports: CollectedImport[],
  project: Project,
): number {
  // We only need one successful findReferences call — it returns global results
  for (const imp of matchingImports) {
    const sourceFile = project.getSourceFile(imp.filePath);
    if (!sourceFile) continue;

    const identifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((id) => id.getText() === symbolName);

    for (const id of identifiers) {
      try {
        const refs = id.findReferencesAsNodes();
        // Exclude references in .d.ts files (declaration files)
        const projectRefs = refs.filter(
          (r) => !r.getSourceFile().getFilePath().endsWith('.d.ts'),
        );
        return Math.max(projectRefs.length, 1);
      } catch {
        // findReferences can fail on some nodes, try next
      }
    }
  }

  return 1;
}
