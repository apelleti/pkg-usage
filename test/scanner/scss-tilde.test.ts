import { describe, it, expect } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { scanScssFiles } from '../../src/scanner/scss-scanner.js';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger(false, true);
const TMP = path.resolve(__dirname, '../fixtures/tmp-scss');

describe('scss-scanner tilde prefix', () => {
  beforeEach(async () => {
    await mkdir(TMP, { recursive: true });
  });

  afterEach(async () => {
    await rm(TMP, { recursive: true, force: true });
  });

  it('handles webpack ~ prefix in @use', async () => {
    await writeFile(
      path.join(TMP, 'test.scss'),
      `@use '~@mock-scope/components/theming';\n`,
    );

    const targets = new Set(['@mock-scope/components']);
    const usages = await scanScssFiles(TMP, targets, [], logger);

    expect(usages).toHaveLength(1);
    expect(usages[0].packageName).toBe('@mock-scope/components');
  });

  it('handles webpack ~ prefix in @import', async () => {
    await writeFile(
      path.join(TMP, 'test.scss'),
      `@import '~@mock-scope/utils/mixins';\n`,
    );

    const targets = new Set(['@mock-scope/utils']);
    const usages = await scanScssFiles(TMP, targets, [], logger);

    expect(usages).toHaveLength(1);
    expect(usages[0].packageName).toBe('@mock-scope/utils');
  });
});
