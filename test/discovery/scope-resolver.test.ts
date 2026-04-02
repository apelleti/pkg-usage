import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  isScope,
  isSubEntryPoint,
  getBasePackage,
  getSubPath,
  listScopePackages,
  resolveTarget,
} from '../../src/discovery/scope-resolver.js';

const FIXTURES = path.resolve(__dirname, '../fixtures/mock-project');

describe('isScope', () => {
  it('returns true for scopes', () => {
    expect(isScope('@angular')).toBe(true);
    expect(isScope('@mock-scope')).toBe(true);
  });

  it('returns false for packages', () => {
    expect(isScope('@angular/cdk')).toBe(false);
    expect(isScope('lodash')).toBe(false);
  });
});

describe('isSubEntryPoint', () => {
  it('detects sub-entry-points', () => {
    expect(isSubEntryPoint('@angular/cdk/overlay')).toBe(true);
    expect(isSubEntryPoint('lodash/fp')).toBe(true);
  });

  it('returns false for packages', () => {
    expect(isSubEntryPoint('@angular/cdk')).toBe(false);
    expect(isSubEntryPoint('lodash')).toBe(false);
  });
});

describe('getBasePackage', () => {
  it('extracts base package from scoped', () => {
    expect(getBasePackage('@angular/cdk/overlay')).toBe('@angular/cdk');
    expect(getBasePackage('@angular/cdk')).toBe('@angular/cdk');
  });

  it('extracts base package from unscoped', () => {
    expect(getBasePackage('lodash/fp')).toBe('lodash');
    expect(getBasePackage('lodash')).toBe('lodash');
  });
});

describe('getSubPath', () => {
  it('extracts sub-path', () => {
    expect(getSubPath('@angular/cdk/overlay')).toBe('./overlay');
    expect(getSubPath('@angular/cdk/a/b')).toBe('./a/b');
    expect(getSubPath('lodash/fp')).toBe('./fp');
  });
});

describe('listScopePackages', () => {
  it('lists packages under a scope', async () => {
    const packages = await listScopePackages('@mock-scope', FIXTURES);
    expect(packages).toEqual(['@mock-scope/components', '@mock-scope/utils']);
  });

  it('throws for non-existent scope', async () => {
    await expect(
      listScopePackages('@nonexistent', FIXTURES),
    ).rejects.toThrow('Scope not found');
  });
});

describe('resolveTarget', () => {
  it('resolves scope to packages', async () => {
    const result = await resolveTarget('@mock-scope', FIXTURES);
    expect(result).toEqual(['@mock-scope/components', '@mock-scope/utils']);
  });

  it('resolves package to itself', async () => {
    const result = await resolveTarget('simple-lib', FIXTURES);
    expect(result).toEqual(['simple-lib']);
  });

  it('resolves sub-entry-point to base package', async () => {
    const result = await resolveTarget('@mock-scope/components/button', FIXTURES);
    expect(result).toEqual(['@mock-scope/components']);
  });
});
