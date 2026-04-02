import { Project, type SourceFile, SyntaxKind } from 'ts-morph';
import { AngularSymbolKind } from '../model/angular-kinds.js';
import type { ExportedSymbol } from '../model/types.js';

/** Create a lightweight ts-morph Project for parsing .d.ts files */
export function createDiscoveryProject(): Project {
  return new Project({
    compilerOptions: {
      declaration: true,
      skipLibCheck: true,
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
}

/** Map a SyntaxKind to a base AngularSymbolKind */
function kindFromDeclaration(syntaxKind: SyntaxKind): AngularSymbolKind {
  switch (syntaxKind) {
    case SyntaxKind.ClassDeclaration:
      return AngularSymbolKind.Class;
    case SyntaxKind.FunctionDeclaration:
      return AngularSymbolKind.Function;
    case SyntaxKind.InterfaceDeclaration:
      return AngularSymbolKind.Interface;
    case SyntaxKind.TypeAliasDeclaration:
      return AngularSymbolKind.TypeAlias;
    case SyntaxKind.EnumDeclaration:
      return AngularSymbolKind.Enum;
    case SyntaxKind.VariableDeclaration:
      return AngularSymbolKind.Constant;
    default:
      return AngularSymbolKind.Constant;
  }
}

/**
 * Parse a .d.ts file and extract all exported symbols.
 * Automatically follows `export * from './sub'` via ts-morph's getExportedDeclarations().
 */
export function parseDeclarationFile(
  sourceFile: SourceFile,
  entryPointPath: string,
  packageName: string,
): ExportedSymbol[] {
  const symbols: ExportedSymbol[] = [];
  const exportedDeclarations = sourceFile.getExportedDeclarations();

  for (const [name, declarations] of exportedDeclarations) {
    const decl = declarations[0];
    if (!decl) continue;

    const kind = kindFromDeclaration(decl.getKind());

    symbols.push({
      name,
      kind,
      entryPoint: entryPointPath,
      packageName,
    });
  }

  return symbols;
}

/**
 * Add a .d.ts file to a project and parse it, resolving dependencies.
 */
export function addAndParseDeclarationFile(
  project: Project,
  dtsPath: string,
  entryPointPath: string,
  packageName: string,
): ExportedSymbol[] {
  const sourceFile = project.addSourceFileAtPath(dtsPath);
  return parseDeclarationFile(sourceFile, entryPointPath, packageName);
}
