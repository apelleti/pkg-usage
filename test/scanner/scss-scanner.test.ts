import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { scanScssFiles } from '../../src/scanner/scss-scanner.js';
import { createLogger } from '../../src/utils/logger.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');
const logger = createLogger(false, true);

describe('scss-scanner', () => {
  it('detects @use from target packages', async () => {
    const targets = new Set(['@mock-scope/utils']);
    const usages = await scanScssFiles(FIXTURES, targets, [], logger);

    const utilsUsage = usages.find((u) => u.packageName === '@mock-scope/utils');
    expect(utilsUsage).toBeDefined();
    expect(utilsUsage!.location.context).toBe('scss-import');
    expect(utilsUsage!.location.filePath).toContain('styles.scss');
  });

  it('detects @import from target packages', async () => {
    const targets = new Set(['@mock-scope/components']);
    const usages = await scanScssFiles(FIXTURES, targets, [], logger);

    const compUsage = usages.find((u) => u.packageName === '@mock-scope/components');
    expect(compUsage).toBeDefined();
    expect(compUsage!.location.context).toBe('scss-import');
  });

  it('returns empty for non-matching packages', async () => {
    const targets = new Set(['non-existent-pkg']);
    const usages = await scanScssFiles(FIXTURES, targets, [], logger);
    expect(usages).toHaveLength(0);
  });
});
