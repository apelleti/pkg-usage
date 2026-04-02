import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyze } from './analyzer.js';
import { toJson } from './reporters/json-reporter.js';
import { toMarkdown } from './reporters/markdown-reporter.js';
import { toHtml } from './reporters/html-reporter.js';
import { createLogger } from './utils/logger.js';

const argv = await yargs(hideBin(process.argv))
  .usage('$0 <target> [options]')
  .positional('target', {
    describe:
      'Package name, scope, or entry point (e.g. @angular/cdk, @angular, lodash)',
    type: 'string',
  })
  .option('project', {
    alias: 'p',
    describe: 'Path to tsconfig.json',
    type: 'string',
    default: './tsconfig.json',
  })
  .option('format', {
    alias: 'f',
    describe: 'Output format',
    choices: ['json', 'markdown', 'html'] as const,
    default: 'json' as const,
  })
  .option('output', {
    alias: 'o',
    describe: 'Output file (default: stdout)',
    type: 'string',
  })
  .option('include-types', {
    describe: 'Include type-only imports as "used"',
    type: 'boolean',
    default: false,
  })
  .option('include-tests', {
    describe: 'Include .spec.ts / .test.ts files in scan',
    type: 'boolean',
    default: false,
  })
  .option('unused-only', {
    describe: 'Only show unused symbols',
    type: 'boolean',
    default: false,
  })
  .option('used-only', {
    describe: 'Only show used symbols',
    type: 'boolean',
    default: false,
  })
  .option('min-refs', {
    describe: 'Filter: symbols with at least n references',
    type: 'number',
  })
  .option('sort', {
    describe: 'Sort by',
    choices: ['name', 'kind', 'refs'] as const,
    default: 'name' as const,
  })
  .option('summary', {
    describe: 'Show only summary without per-symbol details',
    type: 'boolean',
    default: false,
  })
  .option('deep', {
    describe: 'Deep analysis: exact reference counting and namespace import resolution (slower)',
    type: 'boolean',
    default: false,
  })
  .option('exclude', {
    describe: 'Exclude files matching pattern (repeatable)',
    type: 'string',
    array: true,
    default: [] as string[],
  })
  .option('verbose', {
    describe: 'Verbose logging',
    type: 'boolean',
    default: false,
  })
  .option('no-color', {
    describe: 'Disable colors',
    type: 'boolean',
    default: false,
  })
  .demandCommand(1, 'Please specify a target package or scope')
  .help()
  .version()
  .strict()
  .parse();

async function main() {
  const target = argv._[0] as string;
  const logger = createLogger(argv.verbose, argv['no-color'] as boolean);

  try {
    const result = await analyze(
      {
        target,
        projectRoot: resolve(process.cwd()),
        tsConfigPath: argv.project,
        includeTypes: argv['include-types'] as boolean,
        includeTests: argv['include-tests'] as boolean,
        exclude: argv.exclude as string[],
        deep: argv.deep as boolean,
      },
      logger,
    );

    let output: string;
    switch (argv.format) {
      case 'markdown':
        output = toMarkdown(result, {
          unusedOnly: argv['unused-only'] as boolean,
          usedOnly: argv['used-only'] as boolean,
          summaryOnly: argv.summary,
          sort: argv.sort,
          minRefs: argv['min-refs'] as number | undefined,
        });
        break;
      case 'html':
        output = toHtml(result);
        break;
      case 'json':
      default:
        output = toJson(result);
        break;
    }

    const outputFile = argv.output ?? (argv.format === 'html' ? './report.html' : undefined);
    if (outputFile) {
      await writeFile(outputFile, output, 'utf-8');
      logger.info(`Report written to ${outputFile}`);
    } else {
      process.stdout.write(output + '\n');
    }
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

main();
