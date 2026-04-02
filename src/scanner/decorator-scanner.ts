import { type Project, type SourceFile, SyntaxKind } from 'ts-morph';
import type { UsageLocation } from '../model/types.js';

export interface DecoratorUsage {
  symbolName: string;
  location: UsageLocation;
}

/**
 * Scan project files for symbols referenced in Angular decorator arrays:
 * - @Component({ imports: [...], providers: [...] })
 * - @NgModule({ imports: [...], providers: [...] })
 *
 * Only symbols that are in `importedSymbolNames` (i.e. imported from target packages)
 * are tracked.
 */
export function collectDecoratorUsages(
  project: Project,
  importedSymbolNames: Set<string>,
): DecoratorUsage[] {
  const usages: DecoratorUsage[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    usages.push(...scanFileDecorators(sourceFile, importedSymbolNames));
  }

  return usages;
}

function scanFileDecorators(
  sourceFile: SourceFile,
  importedSymbolNames: Set<string>,
): DecoratorUsage[] {
  const usages: DecoratorUsage[] = [];
  const filePath = sourceFile.getFilePath();

  for (const cls of sourceFile.getClasses()) {
    for (const decorator of cls.getDecorators()) {
      const name = decorator.getName();
      if (name !== 'Component' && name !== 'NgModule') continue;

      const args = decorator.getArguments();
      if (args.length === 0) continue;

      const arg = args[0];
      if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
      const obj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

      // Scan 'imports' array
      const importsContext =
        name === 'Component'
          ? ('decorator-standalone-imports' as const)
          : ('decorator-imports' as const);

      usages.push(
        ...extractArrayIdentifiers(obj, 'imports', filePath, importsContext, importedSymbolNames),
      );

      // Scan 'providers' array
      usages.push(
        ...extractArrayIdentifiers(obj, 'providers', filePath, 'decorator-providers', importedSymbolNames),
      );
    }
  }

  return usages;
}

function extractArrayIdentifiers(
  obj: import('ts-morph').ObjectLiteralExpression,
  propertyName: string,
  filePath: string,
  context: UsageLocation['context'],
  importedSymbolNames: Set<string>,
): DecoratorUsage[] {
  const usages: DecoratorUsage[] = [];

  const prop = obj.getProperty(propertyName);
  if (!prop || prop.getKind() !== SyntaxKind.PropertyAssignment) return usages;

  const initializer = prop.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
  if (!initializer || initializer.getKind() !== SyntaxKind.ArrayLiteralExpression) return usages;

  const arr = initializer.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  for (const element of arr.getElements()) {
    if (element.getKind() === SyntaxKind.Identifier) {
      const symbolName = element.getText();
      if (importedSymbolNames.has(symbolName)) {
        usages.push({
          symbolName,
          location: {
            filePath,
            line: element.getStartLineNumber(),
            column: element.getStart() - element.getSourceFile().getFullText().lastIndexOf('\n', element.getStart()),
            context,
          },
        });
      }
    }
  }

  return usages;
}
