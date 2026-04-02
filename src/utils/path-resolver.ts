import { access } from 'node:fs/promises';
import path from 'node:path';

export function resolvePackagePath(packageName: string, projectRoot: string): string {
  return path.join(projectRoot, 'node_modules', packageName);
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
