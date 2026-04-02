import { type SourceFile, SyntaxKind, type Project } from 'ts-morph';
import { AngularSymbolKind } from '../model/angular-kinds.js';
import type { ExportedSymbol } from '../model/types.js';

/**
 * Angular compiler emits static properties on compiled classes:
 * - ɵcmp → Component
 * - ɵdir → Directive
 * - ɵpipe → Pipe
 * - ɵmod → NgModule
 * - ɵprov → Injectable (Service)
 * - ɵfac → Factory (present on all, not distinguishing)
 *
 * These markers are stable across Angular 14+.
 */
const ANGULAR_MARKERS: Record<string, AngularSymbolKind> = {
  'ɵcmp': AngularSymbolKind.Component,
  'ɵdir': AngularSymbolKind.Directive,
  'ɵpipe': AngularSymbolKind.Pipe,
  'ɵmod': AngularSymbolKind.NgModule,
  'ɵprov': AngularSymbolKind.Service,
};

/**
 * Classify symbols by inspecting the .d.ts source files for Angular markers.
 * Mutates the `kind` field of each symbol in-place.
 */
export function classifyAngularSymbols(
  symbols: ExportedSymbol[],
  project: Project,
): void {
  // Build a set of class names for quick lookup
  const classSymbols = symbols.filter((s) => s.kind === AngularSymbolKind.Class);
  if (classSymbols.length === 0) return;

  const classNames = new Set(classSymbols.map((s) => s.name));

  // Scan all source files loaded in the project
  for (const sourceFile of project.getSourceFiles()) {
    classifyInSourceFile(sourceFile, classNames, symbols);
  }

  // Classify InjectionToken constants
  for (const symbol of symbols) {
    if (symbol.kind === AngularSymbolKind.Constant) {
      classifyInjectionToken(symbol, project);
    }
  }
}

function classifyInSourceFile(
  sourceFile: SourceFile,
  classNames: Set<string>,
  symbols: ExportedSymbol[],
): void {
  const classDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.ClassDeclaration);

  for (const classDecl of classDeclarations) {
    const className = classDecl.getName();
    if (!className || !classNames.has(className)) continue;

    // Look for Angular static marker properties
    const staticProperties = classDecl.getStaticProperties();
    for (const prop of staticProperties) {
      const propName = prop.getName();
      const angularKind = ANGULAR_MARKERS[propName];
      if (angularKind) {
        const symbol = symbols.find(
          (s) => s.name === className && s.kind === AngularSymbolKind.Class,
        );
        if (symbol) {
          symbol.kind = angularKind;

          // Extract selector for components and directives
          if (
            angularKind === AngularSymbolKind.Component ||
            angularKind === AngularSymbolKind.Directive
          ) {
            symbol.selector = extractSelector(prop, className, angularKind);
          }

          // ɵcmp takes priority over ɵdir (Component extends Directive)
          if (angularKind === AngularSymbolKind.Component) break;
        }
      }
    }
  }
}

/**
 * Extract the Angular selector from the type annotation of ɵcmp/ɵdir,
 * or fall back to a kebab-case heuristic from the class name.
 */
function extractSelector(
  prop: import('ts-morph').ClassMemberTypes,
  className: string,
  kind: AngularSymbolKind,
): string {
  // Try to extract from the type text: static ɵcmp: i0.ɵɵComponentDeclaration<..., "app-button", ...>
  try {
    const typeText = prop.getType?.().getText() ?? '';
    // Angular's ComponentDeclaration/DirectiveDeclaration has the selector as a string literal type param
    const selectorMatch = typeText.match(/"([^"]+)"/);
    if (selectorMatch) {
      return selectorMatch[1];
    }
  } catch {
    // Type resolution might fail on some .d.ts files
  }

  // Heuristic: convert class name to kebab-case selector
  const baseName = className
    .replace(/Component$|Directive$/, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  return kind === AngularSymbolKind.Directive ? `[${baseName}]` : baseName;
}

function classifyInjectionToken(symbol: ExportedSymbol, project: Project): void {
  for (const sourceFile of project.getSourceFiles()) {
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    const declarations = exportedDeclarations.get(symbol.name);
    if (!declarations) continue;

    for (const decl of declarations) {
      const text = decl.getText();
      if (text.includes('InjectionToken')) {
        symbol.kind = AngularSymbolKind.Token;
        return;
      }
    }
  }
}
