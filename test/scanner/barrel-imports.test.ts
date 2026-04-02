import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  createScannerProject,
  collectImports,
  collectBarrelImports,
} from '../../src/scanner/import-collector.js';
import { createLogger } from '../../src/utils/logger.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');
const logger = createLogger(false, true);

describe('barrel-imports', () => {
  it('tracks imports through local barrels', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const targets = new Set(['@mock-scope/utils']);

    const directImports = collectImports(project, targets, logger);
    const barrelImports = collectBarrelImports(project, directImports, logger);

    // barrel.ts re-exports formatDate from @mock-scope/utils
    // barrel-consumer.ts imports formatDate from ./barrel
    // → should be tracked as a usage of @mock-scope/utils::formatDate
    const formatDateBarrel = barrelImports.find(
      (i) => i.symbolName === 'formatDate',
    );
    expect(formatDateBarrel).toBeDefined();
    expect(formatDateBarrel!.moduleSpecifier).toBe('@mock-scope/utils');
    expect(formatDateBarrel!.filePath).toContain('barrel-consumer.ts');
  });

  it('returns empty array when no barrels exist', () => {
    const project = createScannerProject(FIXTURES, './tsconfig.json', false, []);
    const targets = new Set(['simple-lib']);

    const directImports = collectImports(project, targets, logger);
    const barrelImports = collectBarrelImports(project, directImports, logger);

    expect(barrelImports).toHaveLength(0);
  });
});
