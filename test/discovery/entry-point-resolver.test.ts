import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolvePackageEntryPoints } from '../../src/discovery/entry-point-resolver.js';
import { createLogger } from '../../src/utils/logger.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');
const logger = createLogger(false, true);

describe('resolvePackageEntryPoints', () => {
  it('resolves entry points from exports field', async () => {
    const info = await resolvePackageEntryPoints(
      '@mock-scope/components',
      FIXTURES,
      logger,
    );

    expect(info.name).toBe('@mock-scope/components');
    expect(info.version).toBe('1.0.0');
    expect(info.entryPoints).toHaveLength(2);
    expect(info.entryPoints.map((ep) => ep.path).sort()).toEqual([
      '@mock-scope/components',
      '@mock-scope/components/button',
    ]);
  });

  it('resolves entry points from types fallback', async () => {
    const info = await resolvePackageEntryPoints(
      '@mock-scope/utils',
      FIXTURES,
      logger,
    );

    expect(info.name).toBe('@mock-scope/utils');
    expect(info.version).toBe('2.0.0');
    expect(info.entryPoints).toHaveLength(1);
    expect(info.entryPoints[0].path).toBe('@mock-scope/utils');
  });

  it('filters to sub-entry-point when target is specific', async () => {
    const info = await resolvePackageEntryPoints(
      '@mock-scope/components',
      FIXTURES,
      logger,
      '@mock-scope/components/button',
    );

    expect(info.entryPoints).toHaveLength(1);
    expect(info.entryPoints[0].path).toBe('@mock-scope/components/button');
  });

  it('throws for non-existent package', async () => {
    await expect(
      resolvePackageEntryPoints('nonexistent-pkg', FIXTURES, logger),
    ).rejects.toThrow('Package not found');
  });
});
