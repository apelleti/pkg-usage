import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { analyze } from '../../src/analyzer.js';
import { createLogger } from '../../src/utils/logger.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');
const logger = createLogger(false, true);

describe('deep reference counting', () => {
  it('produces higher reference counts in deep mode', { timeout: 30000 }, async () => {
    const normalResult = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
        deep: false,
      },
      logger,
    );

    const deepResult = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
        deep: true,
      },
      logger,
    );

    // Both should find the same symbols used/unused
    expect(normalResult.summary.totalUsed).toBe(deepResult.summary.totalUsed);
    expect(normalResult.summary.totalUnused).toBe(deepResult.summary.totalUnused);

    // Deep mode should have >= reference counts for each used symbol
    const normalSymbols = normalResult.packages[0].entryPoints.flatMap((ep) => ep.symbols);
    const deepSymbols = deepResult.packages[0].entryPoints.flatMap((ep) => ep.symbols);

    for (const ns of normalSymbols) {
      if (!ns.used) continue;
      const ds = deepSymbols.find((s) => s.name === ns.name);
      expect(ds).toBeDefined();
      expect(ds!.usage!.referenceCount).toBeGreaterThanOrEqual(
        ns.usage!.referenceCount,
      );
    }
  });

  it('resolves namespace imports in deep mode', async () => {
    const deepResult = await analyze(
      {
        target: '@mock-scope/components',
        projectRoot: FIXTURES,
        tsConfigPath: './tsconfig.json',
        deep: true,
      },
      logger,
    );

    const allSymbols = deepResult.packages[0].entryPoints.flatMap((ep) => ep.symbols);
    const appComp = allSymbols.find((s) => s.name === 'AppComponent');

    // AppComponent is imported both as named import and via namespace (components.AppComponent)
    // Deep mode should count more references
    expect(appComp?.used).toBe(true);
    expect(appComp!.usage!.referenceCount).toBeGreaterThanOrEqual(2);
  });
});
