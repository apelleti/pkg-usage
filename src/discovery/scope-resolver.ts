import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolvePackagePath, pathExists } from '../utils/path-resolver.js';

/** Check if target is a scope (e.g. "@angular") */
export function isScope(target: string): boolean {
  return /^@[^/]+$/.test(target);
}

/** Check if target is a sub-entry-point (e.g. "@angular/cdk/overlay") */
export function isSubEntryPoint(target: string): boolean {
  const parts = target.startsWith('@')
    ? target.split('/')
    : target.split('/');
  return target.startsWith('@') ? parts.length > 2 : parts.length > 1;
}

/** Extract the base package name from a target (e.g. "@angular/cdk/overlay" → "@angular/cdk") */
export function getBasePackage(target: string): string {
  const parts = target.split('/');
  if (target.startsWith('@')) {
    return parts.slice(0, 2).join('/');
  }
  return parts[0];
}

/** Extract the sub-path from a target (e.g. "@angular/cdk/overlay" → "./overlay") */
export function getSubPath(target: string): string {
  const parts = target.split('/');
  const rest = target.startsWith('@') ? parts.slice(2) : parts.slice(1);
  return './' + rest.join('/');
}

/** List all packages under a scope in node_modules */
export async function listScopePackages(
  scope: string,
  projectRoot: string,
): Promise<string[]> {
  const scopeDir = resolvePackagePath(scope, projectRoot);
  if (!(await pathExists(scopeDir))) {
    throw new Error(`Scope not found: ${scope} (looked in ${scopeDir})`);
  }

  const entries = await readdir(scopeDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => `${scope}/${e.name}`)
    .sort();
}

/**
 * Resolve a target to a list of package names.
 * - Scope "@angular" → all packages under @angular/*
 * - Package "@angular/cdk" → ["@angular/cdk"]
 * - Sub-entry-point "@angular/cdk/overlay" → ["@angular/cdk"] (filtered later)
 */
export async function resolveTarget(
  target: string,
  projectRoot: string,
): Promise<string[]> {
  if (isScope(target)) {
    return listScopePackages(target, projectRoot);
  }
  return [getBasePackage(target)];
}
