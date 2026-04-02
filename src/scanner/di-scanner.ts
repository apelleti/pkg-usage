import { type Project, SyntaxKind } from 'ts-morph';
import type { ExportedSymbol } from '../model/types.js';
import { AngularSymbolKind } from '../model/angular-kinds.js';
import type { Logger } from '../utils/logger.js';
import type { DecoratorUsage } from './decorator-scanner.js';

/**
 * Scan for services used via dependency injection (constructor injection)
 * without an explicit import from the target package.
 *
 * Detects patterns like:
 *   constructor(private myService: MyService) {}
 * where MyService is an exported service from a target package.
 */
export function scanDIUsages(
  project: Project,
  exportedSymbols: ExportedSymbol[],
  logger: Logger,
): DecoratorUsage[] {
  const usages: DecoratorUsage[] = [];

  // Only look for services (Injectable)
  const serviceNames = new Set(
    exportedSymbols
      .filter((s) => s.kind === AngularSymbolKind.Service)
      .map((s) => s.name),
  );

  if (serviceNames.size === 0) return usages;

  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const constructors = cls.getConstructors();
      for (const ctor of constructors) {
        for (const param of ctor.getParameters()) {
          // Check the type annotation text
          const typeNode = param.getTypeNode();
          if (!typeNode) continue;

          const typeName = typeNode.getText();
          if (serviceNames.has(typeName)) {
            usages.push({
              symbolName: typeName,
              location: {
                filePath: sourceFile.getFilePath(),
                line: param.getStartLineNumber(),
                column: 0,
                context: 'code',
              },
            });
          }
        }
      }
    }
  }

  return usages;
}
