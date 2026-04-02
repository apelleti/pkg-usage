import type { AnalysisResult } from '../model/types.js';

export function toJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
