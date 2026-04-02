import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PackageJson {
  name: string;
  version: string;
  exports?: Record<string, unknown>;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  [key: string]: unknown;
}

export async function readPackageJson(packageDir: string): Promise<PackageJson> {
  const filePath = path.join(packageDir, 'package.json');
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as PackageJson;
  } catch {
    throw new Error(`Package not found: could not read ${filePath}`);
  }
}
