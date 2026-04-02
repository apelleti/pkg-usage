# pkg-usage — Analyseur d'usage des exports publics d'un package/scope npm

## 1. Objectif

Librairie NPM (CLI + API programmatique) qui, pour un package ou un scope npm donné :

1. **Découvre** tous les exports publics (composants, directives, pipes, services, fonctions, classes, types, constantes, enums)
2. **Scanne** le projet Angular courant pour identifier lesquels sont effectivement importés et utilisés
3. **Produit** un rapport structuré (JSON / Markdown / HTML interactif)

### Cas d'usage

```bash
# Analyser un package unique
npx pkg-usage @angular/cdk

# Analyser tout un scope
npx pkg-usage @angular

# Analyser un package tiers
npx pkg-usage ngx-translate

# Limiter à un sous-entry point
npx pkg-usage @angular/cdk/overlay
```

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        CLI / API                         │
│  parse args → validate → run Analyzer → format output    │
└──────────────┬───────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │    Analyzer     │  Orchestrateur principal
       └───────┬────────┘
               │
   ┌───────────┼────────────────┐
   ▼           ▼                ▼
┌────────┐ ┌──────────┐  ┌──────────┐
│ Export  │ │  Usage   │  │ Reporter │
│Discovery│ │ Scanner  │  │ (3 fmt)  │
└────────┘ └──────────┘  └──────────┘
```

### 2.1 Modules

| Module              | Responsabilité                                                       |
|---------------------|----------------------------------------------------------------------|
| `ExportDiscovery`   | Résout les exports publics d'un ou plusieurs packages                |
| `UsageScanner`      | Parcourt le projet TS pour détecter les imports et usages effectifs   |
| `Analyzer`          | Orchestre Discovery → Scanner → modèle unifié                        |
| `Reporter`          | Transforme le modèle en JSON / Markdown / HTML                       |
| `CLI`               | Interface ligne de commande (yargs ou commander)                     |

---

## 3. Export Discovery

### 3.1 Stratégie combinée

```
Entrée: "@angular/cdk" ou "@angular"
                │
                ▼
   ┌─── Scope ou Package ? ───┐
   │                          │
   ▼ (scope)                  ▼ (package)
 Lister les dossiers         Aller directement
 node_modules/@scope/*       au package
   │                          │
   ▼                          ▼
 Pour chaque package :
   │
   ├─ 1. Lire package.json
   │     → champ "exports" (conditional exports map)
   │     → fallback: "main", "module", "types", "typings"
   │
   ├─ 2. Pour chaque entry point identifié :
   │     → Résoudre le fichier .d.ts correspondant
   │     → Parser avec ts-morph
   │     → Extraire tous les symboles exportés
   │
   └─ 3. Classifier chaque symbole
```

### 3.2 Résolution des entry points

**Priorité 1 : champ `exports` du package.json**

```json
{
  "exports": {
    ".": { "types": "./index.d.ts" },
    "./overlay": { "types": "./overlay/index.d.ts" },
    "./scrolling": { "types": "./scrolling/index.d.ts" }
  }
}
```

On extrait chaque clé `./*` comme un entry point, et on résout le chemin `types` (ou `default` → `.d.ts` adjacent).

**Priorité 2 : fallback classique**

Si pas de champ `exports` :
- `types` ou `typings` dans package.json → fichier .d.ts racine
- Sinon : chercher `index.d.ts` à la racine du package

**Priorité 3 : deep scan .d.ts**

Pour les packages qui re-exportent depuis des sous-modules internes, suivre les `export * from './sub'` récursivement dans les .d.ts.

### 3.3 Extraction des symboles

Pour chaque `.d.ts`, extraire via ts-morph :

| Type de symbole        | Détection AST                                    | Angular-specific          |
|------------------------|--------------------------------------------------|---------------------------|
| Class                  | `ClassDeclaration` avec `export`                 | `@Component`, `@Directive`, `@Pipe`, `@Injectable`, `@NgModule` |
| Function               | `FunctionDeclaration` avec `export`              | —                         |
| Const / Variable       | `VariableStatement` avec `export`                | Injection tokens          |
| Interface              | `InterfaceDeclaration` avec `export`             | —                         |
| Type Alias             | `TypeAliasDeclaration` avec `export`             | —                         |
| Enum                   | `EnumDeclaration` avec `export`                  | —                         |
| Re-export              | `ExportDeclaration` (barrel)                     | —                         |

### 3.4 Classification Angular

Pour chaque classe exportée, détecter les décorateurs Angular :

```typescript
enum AngularSymbolKind {
  Component = 'component',
  Directive = 'directive',
  Pipe = 'pipe',
  Service = 'service',        // @Injectable
  NgModule = 'ngmodule',
  Guard = 'guard',            // heuristique: implement CanActivate etc.
  Interceptor = 'interceptor',
  Token = 'injection-token',  // new InjectionToken<T>()
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  TypeAlias = 'type',
  Enum = 'enum',
  Constant = 'constant',
}
```

---

## 4. Usage Scanner

### 4.1 Initialisation ts-morph

```typescript
const project = new Project({
  tsConfigFilePath: path.resolve(projectRoot, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: false,
});
```

Le scanner opère sur les source files du projet (excluant `node_modules`, `dist`, fichiers de test selon config).

### 4.2 Détection des imports

Pour chaque source file, analyser les `ImportDeclaration` :

```typescript
// Cas 1 : Named import
import { OverlayModule, Overlay } from '@angular/cdk/overlay';

// Cas 2 : Namespace import
import * as overlay from '@angular/cdk/overlay';

// Cas 3 : Re-export dans un barrel local
export { OverlayModule } from '@angular/cdk/overlay';

// Cas 4 : Dynamic import
const mod = await import('@angular/cdk/overlay');

// Cas 5 : Type-only import
import type { OverlayConfig } from '@angular/cdk/overlay';
```

### 4.3 Détection des usages effectifs

Un symbole **importé** n'est pas forcément **utilisé**. Le scanner doit vérifier l'usage réel :

| Contexte d'usage             | Détection                                                |
|------------------------------|----------------------------------------------------------|
| Référence dans le code TS     | `Identifier` references via ts-morph `findReferences()`  |
| Décorateur `imports: [...]`   | Array literal dans `@Component` / `@NgModule`            |
| Décorateur `providers: [...]` | Array literal dans `@Component` / `@NgModule`            |
| Décorateur `imports: [...]` (standalone) | Array literal dans `@Component` standalone      |
| `providedIn: 'root'`         | Service injecté sans import explicite via DI               |
| Template HTML inline          | Parser les templates inline pour les sélecteurs           |
| Template HTML externe         | Lire le `templateUrl` et parser le HTML                   |
| Utilisation dans les styles   | `@use` / `@import` de fichiers SCSS depuis un package     |
| Type-only usage               | Import utilisé uniquement en position de type             |

### 4.4 Granularité de l'usage

Pour chaque symbole utilisé, capturer :

```typescript
interface SymbolUsage {
  /** Le symbole public du package */
  symbol: ExportedSymbol;

  /** Fichiers où il est importé */
  importedIn: FileLocation[];

  /** Fichiers où il est effectivement utilisé (au-delà de l'import) */
  usedIn: UsageLocation[];

  /** Nombre total de références */
  referenceCount: number;

  /** Type d'usage */
  usageKind: 'runtime' | 'type-only' | 'both';
}

interface UsageLocation {
  filePath: string;
  line: number;
  column: number;
  context: 'code' | 'decorator-imports' | 'decorator-providers' | 'decorator-standalone-imports' | 'template' | 'style' | 'scss-import';
}
```

---

## 5. Modèle de données unifié

```typescript
interface AnalysisResult {
  /** Métadonnées de l'analyse */
  meta: {
    analyzedAt: string;       // ISO timestamp
    projectRoot: string;
    target: string;           // ex: "@angular/cdk" ou "@angular"
    duration: number;         // ms
    projectFiles: number;     // nb fichiers scannés
  };

  /** Résultats par package */
  packages: PackageAnalysis[];

  /** Résumé global */
  summary: {
    totalPackages: number;
    totalExports: number;
    totalUsed: number;
    totalUnused: number;
    usageRatio: number;       // 0-1
  };
}

interface PackageAnalysis {
  /** Nom complet du package */
  name: string;               // ex: "@angular/cdk"
  version: string;            // ex: "17.3.1"

  /** Entry points analysés */
  entryPoints: EntryPointAnalysis[];

  /** Résumé par package */
  summary: {
    totalExports: number;
    used: number;
    unused: number;
    usageRatio: number;
  };
}

interface EntryPointAnalysis {
  /** Chemin de l'entry point */
  path: string;               // ex: "@angular/cdk/overlay"

  /** Symboles exportés avec leur statut d'usage */
  symbols: SymbolAnalysis[];
}

interface SymbolAnalysis {
  /** Nom du symbole */
  name: string;

  /** Type / classification */
  kind: AngularSymbolKind;

  /** Le symbole est-il importé quelque part ? */
  imported: boolean;

  /** Le symbole est-il effectivement utilisé ? */
  used: boolean;

  /** Détails d'usage (si used = true) */
  usage?: SymbolUsage;
}
```

---

## 6. Reporter

### 6.1 JSON (stdout)

Sortie directe du `AnalysisResult` sérialisé en JSON. Utile pour le piping et l'intégration CI.

```bash
npx pkg-usage @angular/cdk --format json > report.json
```

### 6.2 Markdown

Rapport lisible structuré :

```markdown
# Usage Report: @angular/cdk

> Analyzed on 2026-04-01 • 142 project files scanned • Completed in 3.2s

## Summary

| Metric       | Value       |
|--------------|-------------|
| Packages     | 1           |
| Exports      | 287         |
| Used         | 34 (11.8%)  |
| Unused       | 253 (88.2%) |

## @angular/cdk/overlay (8/23 used — 34.8%)

### ✅ Used (8)

| Symbol          | Kind       | References | Files |
|-----------------|------------|------------|-------|
| Overlay         | service    | 12         | 5     |
| OverlayModule   | ngmodule   | 3          | 3     |
| OverlayConfig   | interface  | 8          | 4     |
| ...             | ...        | ...        | ...   |

### ❌ Unused (15)

| Symbol              | Kind       |
|---------------------|------------|
| FlexibleConnected...| class      |
| ScrollStrategy      | interface  |
| ...                 | ...        |
```

### 6.3 HTML interactif

Single-file HTML avec :
- Vue d'ensemble avec donuts chart (used/unused ratio)
- Filtrage par entry point, par kind, par statut (used/unused)
- Expandable: cliquer sur un symbole → voir les fichiers qui l'utilisent
- Recherche texte
- Tri par colonnes
- Export: bouton pour télécharger le JSON

Technologie : Vanilla HTML/CSS/JS embarqué (zero dependency, single file).

---

## 7. CLI

### 7.1 Interface

```
pkg-usage <target> [options]

Arguments:
  target            Package name, scope, ou entry point
                    Ex: "@angular/cdk", "@angular", "lodash", "@angular/cdk/overlay"

Options:
  -p, --project     Chemin vers le tsconfig.json (default: ./tsconfig.json)
  -f, --format      Format de sortie: json | markdown | html (default: json)
  -o, --output      Fichier de sortie (default: stdout pour json/md, ./report.html pour html)
      --include-types   Inclure les imports type-only dans les "used" (default: false)
      --include-tests   Scanner aussi les fichiers .spec.ts (default: false)
      --unused-only     N'afficher que les symboles non utilisés
      --used-only       N'afficher que les symboles utilisés
      --min-refs <n>    Filtrer: symboles avec au moins n références
      --sort <key>      Trier par: name | kind | refs (default: name)
      --summary         Afficher uniquement le résumé sans le détail par symbole
      --exclude <glob>  Exclure des fichiers du scan (répétable)
      --verbose         Logs détaillés
      --no-color        Désactiver les couleurs dans la sortie terminal
  -h, --help        Afficher l'aide
  -v, --version     Afficher la version
```

### 7.2 Exemples

```bash
# JSON vers stdout
npx pkg-usage @angular/cdk

# Rapport markdown
npx pkg-usage @angular/cdk -f markdown -o usage-report.md

# HTML interactif
npx pkg-usage @angular -f html -o angular-usage.html

# Uniquement les exports inutilisés (audit de tree-shaking)
npx pkg-usage @angular/material --unused-only -f markdown

# Inclure les fichiers de test
npx pkg-usage rxjs --include-tests

# Projet custom
npx pkg-usage @ngrx -p ./projects/my-app/tsconfig.app.json
```

---

## 8. API Programmatique

```typescript
import { analyze } from 'pkg-usage';

const result = await analyze({
  target: '@angular/cdk',
  projectRoot: process.cwd(),
  tsConfigPath: './tsconfig.json',
  includeTypes: false,
  includeTests: false,
});

// result: AnalysisResult

// Reporters
import { toJson, toMarkdown, toHtml } from 'pkg-usage/reporters';

const json = toJson(result);
const md = toMarkdown(result);
const html = toHtml(result);
```

---

## 9. Structure du projet

```
pkg-usage/
├── src/
│   ├── index.ts                    # API publique
│   ├── cli.ts                      # CLI entry point
│   ├── analyzer.ts                 # Orchestrateur
│   │
│   ├── discovery/
│   │   ├── index.ts
│   │   ├── scope-resolver.ts       # Résout @scope → liste de packages
│   │   ├── entry-point-resolver.ts # package.json exports → entry points
│   │   ├── dts-parser.ts           # Parse .d.ts → symboles exportés
│   │   └── angular-classifier.ts   # Classifie les symboles Angular
│   │
│   ├── scanner/
│   │   ├── index.ts
│   │   ├── import-collector.ts     # Collecte les ImportDeclarations
│   │   ├── usage-tracker.ts        # findReferences sur chaque symbole
│   │   ├── template-scanner.ts     # Scanner les templates Angular
│   │   └── scss-scanner.ts         # Scanner les @use/@import SCSS depuis des packages
│   │
│   ├── reporters/
│   │   ├── index.ts
│   │   ├── json-reporter.ts
│   │   ├── markdown-reporter.ts
│   │   └── html-reporter.ts        # Génère le single-file HTML
│   │
│   ├── model/
│   │   ├── types.ts                # Tous les types/interfaces du modèle
│   │   └── angular-kinds.ts        # Enum AngularSymbolKind
│   │
│   └── utils/
│       ├── package-json.ts         # Lecture/parsing de package.json
│       ├── path-resolver.ts        # Résolution de chemins node_modules
│       └── logger.ts               # Logger avec niveaux
│
├── templates/
│   └── report.html                 # Template HTML pour le reporter
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

---

## 10. Stack technique

| Outil         | Rôle                                              |
|---------------|---------------------------------------------------|
| **ts-morph**  | Parsing AST des .d.ts et des sources du projet     |
| **yargs**     | Parsing CLI                                        |
| **chalk**     | Couleurs terminal                                  |
| **ora**       | Spinners pour le feedback de progression            |
| **vitest**    | Tests unitaires et d'intégration                   |
| **tsup**      | Build/bundle (ts-morph exclu du bundle, reste en dep runtime) |

Zero dépendance runtime lourde. ts-morph est la seule dépendance significative (nécessaire pour l'analyse AST TypeScript fiable).

---

## 11. Considérations de performance

### 11.1 Lazy loading ts-morph

ts-morph + TypeScript compiler sont lourds (~50 MB). Stratégie :
- Charger le `Project` une seule fois
- Ne résoudre les types que si `--include-types` est activé (le type-checker est coûteux)
- Utiliser `skipAddingFilesFromTsConfig: true` et ajouter les fichiers manuellement si on veut filtrer

### 11.2 Approche en deux passes

**Passe 1 — rapide (imports seulement)**
- Scanner les `ImportDeclaration` avec un simple AST walk
- Pas besoin du type-checker
- Suffisant pour 90% des cas (import = usage dans Angular)

**Passe 2 — précise (references, optionnelle)**
- Utiliser `findReferencesAsNodes()` pour chaque symbole importé
- Coûteux mais donne le `referenceCount` exact
- Activé via `--deep` ou par défaut dans l'API programmatique

### 11.3 Cache

Pour les gros projets :
- Cacher les exports découverts par package@version dans `node_modules/.cache/pkg-usage/`
- Fallback vers `~/.cache/pkg-usage/` (persiste après `npm ci`)
- Invalider si la version change

---

## 12. Edge cases

| Cas                                  | Gestion                                              |
|--------------------------------------|------------------------------------------------------|
| Package sans types                   | Warning + skip (pas d'analyse possible)              |
| Barrel re-exports (`export *`)       | Suivre récursivement dans les .d.ts                  |
| `import * as X`                      | Tracker `X.Foo` comme usage de `Foo`                 |
| Dynamic imports                      | Détecter `import('...')` expressions                 |
| Path mapping (tsconfig paths)        | Respecter les `paths` du tsconfig                    |
| Monorepo (libs internes)             | Résoudre via les paths ou les symlinks               |
| Secondary entry points Angular       | Supporté nativement via le champ `exports`           |
| Subpath patterns (`exports: ./*`)    | Expander les patterns via glob sur le filesystem     |
| Package non installé                 | Erreur claire : "Package not found in node_modules"  |
| Version mismatch                     | Reporter la version trouvée dans node_modules        |
| `providedIn: 'root'`                | Détecter les services injectés sans import explicite  |
| Re-exports locaux (barrels)          | Suivre les re-exports dans les barrels du projet      |
| SCSS `@use`/`@import` depuis package | Scanner les fichiers .scss pour les imports de packages |
| Standalone components `imports: []`  | Détecter les imports dans le décorateur `@Component`  |

---

## 13. Roadmap

### v1.0 — MVP

- [ ] Discovery via exports + .d.ts
- [ ] Classification Angular (Component, Directive, Pipe, Service, NgModule)
- [ ] Scanner les ImportDeclarations
- [ ] Support standalone components (imports dans le décorateur `@Component`)
- [ ] Détection des re-exports locaux (barrels du projet)
- [ ] Scope resolution (@scope → packages)
- [ ] Reporters: JSON, Markdown
- [ ] CLI basique

### v1.1

- [ ] Reporter HTML interactif
- [ ] Détection des usages dans les templates Angular (sélecteurs, pipes)
- [ ] Détection namespace imports (`import * as X`)
- [ ] Détection `providedIn: 'root'` (services injectés sans import)
- [ ] Scanner les fichiers SCSS pour les `@use`/`@import` de packages
- [ ] Flag `--deep` pour le reference counting

### v2.0

- [ ] Cache des exports par package@version (node_modules/.cache + fallback ~/.cache/pkg-usage/)
- [ ] Intégration CI (exit code si unused ratio > seuil)
- [ ] Watch mode
- [ ] Comparaison entre deux analyses (diff de coverage)
- [ ] Plugin pour `@ngpulse` / `preflight`

---

## 14. Nom du package

Candidats :

| Nom                | Disponibilité npm (à vérifier) | Notes                        |
|--------------------|-------------------------------|------------------------------|
| `pkg-usage`        | ?                             | Générique, clair             |
| `dep-usage`        | ?                             | Focus dépendances            |
| `lib-audit`        | ?                             | Connotation sécurité         |
| `import-coverage`  | ?                             | Explicite                    |
| `@ngpulse/usage`   | Disponible (ton scope)        | Intégré à ton écosystème     |

Recommandation : **`@ngpulse/usage`** pour la cohérence avec l'écosystème existant, avec éventuellement un CLI alias non-scopé (`pkg-usage` ou `ngpulse-usage`).
