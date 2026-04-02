import type { AngularSymbolKind } from './angular-kinds.js';

// --- Analyze options ---

export interface AnalyzeOptions {
  target: string;
  projectRoot: string;
  tsConfigPath?: string;
  includeTypes?: boolean;
  includeTests?: boolean;
  exclude?: string[];
  deep?: boolean;
}

// --- Discovery types ---

export interface PackageInfo {
  name: string;
  version: string;
  packageDir: string;
  entryPoints: EntryPoint[];
}

export interface EntryPoint {
  /** Import path, e.g. "@angular/cdk/overlay" */
  path: string;
  /** Absolute path to the .d.ts file */
  dtsPath: string;
}

export interface ExportedSymbol {
  name: string;
  kind: AngularSymbolKind;
  entryPoint: string;
  packageName: string;
  selector?: string;
}

// --- Scanner types ---

export interface CollectedImport {
  symbolName: string;
  moduleSpecifier: string;
  filePath: string;
  line: number;
  column: number;
  isTypeOnly: boolean;
  isReExport: boolean;
  isNamespaceImport?: boolean;
  namespaceAlias?: string;
}

export interface SymbolUsage {
  symbol: ExportedSymbol;
  importedIn: FileLocation[];
  usedIn: UsageLocation[];
  referenceCount: number;
  usageKind: 'runtime' | 'type-only' | 'both';
}

export interface FileLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface UsageLocation {
  filePath: string;
  line: number;
  column: number;
  context:
    | 'code'
    | 'decorator-imports'
    | 'decorator-providers'
    | 'decorator-standalone-imports'
    | 'template'
    | 'style'
    | 'scss-import';
}

// --- Analysis result ---

export interface AnalysisResult {
  meta: {
    analyzedAt: string;
    projectRoot: string;
    target: string;
    duration: number;
    projectFiles: number;
  };
  packages: PackageAnalysis[];
  summary: {
    totalPackages: number;
    totalExports: number;
    totalUsed: number;
    totalUnused: number;
    usageRatio: number;
  };
}

export interface PackageAnalysis {
  name: string;
  version: string;
  entryPoints: EntryPointAnalysis[];
  summary: {
    totalExports: number;
    used: number;
    unused: number;
    usageRatio: number;
  };
}

export interface EntryPointAnalysis {
  path: string;
  symbols: SymbolAnalysis[];
}

export interface SymbolAnalysis {
  name: string;
  kind: AngularSymbolKind;
  imported: boolean;
  used: boolean;
  usage?: SymbolUsage;
}
