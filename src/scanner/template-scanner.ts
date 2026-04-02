import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Project, SyntaxKind } from 'ts-morph';
import * as parse5 from 'parse5';
import type { ExportedSymbol, UsageLocation } from '../model/types.js';
import { AngularSymbolKind } from '../model/angular-kinds.js';
import type { Logger } from '../utils/logger.js';

export interface TemplateUsage {
  symbolName: string;
  location: UsageLocation;
}

/**
 * Scan Angular templates (inline and external) for component selectors and pipe usages.
 */
export function scanTemplates(
  project: Project,
  exportedSymbols: ExportedSymbol[],
  logger: Logger,
): TemplateUsage[] {
  const usages: TemplateUsage[] = [];

  // Build lookup maps for selectors and pipe names
  const componentSelectors = new Map<string, ExportedSymbol>();
  const directiveSelectors = new Map<string, ExportedSymbol>();
  const pipeNames = new Map<string, ExportedSymbol>();

  for (const symbol of exportedSymbols) {
    if (symbol.kind === AngularSymbolKind.Component && symbol.selector) {
      componentSelectors.set(symbol.selector, symbol);
    } else if (symbol.kind === AngularSymbolKind.Directive && symbol.selector) {
      directiveSelectors.set(symbol.selector, symbol);
    } else if (symbol.kind === AngularSymbolKind.Pipe) {
      // Pipe name: conventionally the class name without "Pipe" suffix, in camelCase
      const pipeName = toPipeName(symbol.name);
      pipeNames.set(pipeName, symbol);
    }
  }

  if (componentSelectors.size === 0 && directiveSelectors.size === 0 && pipeNames.size === 0) {
    return usages;
  }

  // Scan all source files for @Component decorators
  for (const sourceFile of project.getSourceFiles()) {
    for (const cls of sourceFile.getClasses()) {
      const decorator = cls.getDecorator('Component');
      if (!decorator) continue;

      const args = decorator.getArguments();
      if (args.length === 0) continue;

      const arg = args[0];
      if (arg.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
      const obj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

      const filePath = sourceFile.getFilePath();

      // Check inline template
      const templateProp = obj.getProperty('template');
      if (templateProp?.getKind() === SyntaxKind.PropertyAssignment) {
        const init = templateProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
        if (init) {
          const templateText = extractStringLiteral(init.getText());
          if (templateText) {
            usages.push(
              ...parseTemplateForUsages(templateText, filePath, componentSelectors, directiveSelectors, pipeNames),
            );
          }
        }
      }

      // Check external templateUrl
      const templateUrlProp = obj.getProperty('templateUrl');
      if (templateUrlProp?.getKind() === SyntaxKind.PropertyAssignment) {
        const init = templateUrlProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
        if (init) {
          const urlValue = extractStringLiteral(init.getText());
          if (urlValue) {
            const templatePath = path.resolve(path.dirname(filePath), urlValue);
            try {
              const templateContent = readFileSync(templatePath, 'utf-8');
              usages.push(
                ...parseTemplateForUsages(templateContent, templatePath, componentSelectors, directiveSelectors, pipeNames),
              );
            } catch {
              logger.verbose(`  Could not read template: ${templatePath}`);
            }
          }
        }
      }
    }
  }

  return usages;
}

function parseTemplateForUsages(
  html: string,
  filePath: string,
  componentSelectors: Map<string, ExportedSymbol>,
  directiveSelectors: Map<string, ExportedSymbol>,
  pipeNames: Map<string, ExportedSymbol>,
): TemplateUsage[] {
  const usages: TemplateUsage[] = [];

  try {
    const doc = parse5.parseFragment(html, { sourceCodeLocationInfo: true });
    walkNodes(doc, (node) => {
      // Check text nodes for pipe usages: {{ value | pipeName }}
      if ('value' in node && !('tagName' in node)) {
        const textNode = node as parse5.DefaultTreeAdapterMap['textNode'];
        findPipesInText(textNode.value, textNode.sourceCodeLocation?.startLine ?? 0, filePath, pipeNames, usages);
        return;
      }

      if (!('tagName' in node)) return;
      const element = node as parse5.DefaultTreeAdapterMap['element'];

      // Check component selectors (element names)
      const symbol = componentSelectors.get(element.tagName);
      if (symbol) {
        usages.push({
          symbolName: symbol.name,
          location: {
            filePath,
            line: element.sourceCodeLocation?.startLine ?? 0,
            column: element.sourceCodeLocation?.startCol ?? 0,
            context: 'template',
          },
        });
      }

      // Check attributes for directive selectors and pipe usages in bindings
      if (element.attrs) {
        for (const attr of element.attrs) {
          // Directive selectors: [myDirective], (event), plain attribute
          const attrName = attr.name.replace(/^\[|\]$|\(|\)/g, '');
          const dirSymbol = directiveSelectors.get(`[${attrName}]`) ?? directiveSelectors.get(attrName);
          if (dirSymbol) {
            usages.push({
              symbolName: dirSymbol.name,
              location: {
                filePath,
                line: element.sourceCodeLocation?.startLine ?? 0,
                column: element.sourceCodeLocation?.startCol ?? 0,
                context: 'template',
              },
            });
          }

          // Pipe usages in attribute values: [attr]="expr | pipeName"
          if (attr.value) {
            findPipesInText(attr.value, element.sourceCodeLocation?.startLine ?? 0, filePath, pipeNames, usages);
          }
        }
      }
    });
  } catch {
    // Malformed HTML — skip
  }

  return usages;
}

/** Find Angular pipe usages in a text fragment (text node or attribute value) */
function findPipesInText(
  text: string,
  baseLine: number,
  filePath: string,
  pipeNames: Map<string, ExportedSymbol>,
  usages: TemplateUsage[],
): void {
  // Match pipe operator: "expr | pipeName" or "expr | pipeName: arg"
  // Only in Angular expression contexts (skip standalone | characters)
  let pos = 0;
  while (pos < text.length) {
    const pipeIdx = text.indexOf('|', pos);
    if (pipeIdx === -1) break;

    // Extract word after the pipe
    const afterPipe = text.slice(pipeIdx + 1).trimStart();
    const wordMatch = afterPipe.match(/^(\w+)/);
    if (wordMatch) {
      const pipeName = wordMatch[1];
      const pipeSymbol = pipeNames.get(pipeName);
      if (pipeSymbol) {
        usages.push({
          symbolName: pipeSymbol.name,
          location: {
            filePath,
            line: baseLine,
            column: 0,
            context: 'template',
          },
        });
      }
    }

    pos = pipeIdx + 1;
  }
}

function walkNodes(
  node: parse5.DefaultTreeAdapterMap['parentNode'],
  callback: (node: parse5.DefaultTreeAdapterMap['node']) => void,
): void {
  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      callback(child);
      if ('childNodes' in child) {
        walkNodes(child as parse5.DefaultTreeAdapterMap['parentNode'], callback);
      }
    }
  }
}

/** Extract string value from a TS string literal representation */
function extractStringLiteral(text: string): string | null {
  // Remove surrounding quotes (single, double, or backtick)
  const match = text.match(/^['"`]([\s\S]*)['"`]$/);
  return match ? match[1] : null;
}

/** Convert class name to pipe name: DatePipe → date, UpperCasePipe → upperCase */
function toPipeName(className: string): string {
  const name = className.replace(/Pipe$/, '');
  return name.charAt(0).toLowerCase() + name.slice(1);
}
