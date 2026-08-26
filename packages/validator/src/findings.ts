import type { Finding } from '@paperandslate/eom-core/findings';

export {
  finding,
  type Finding,
  type FindingCategory,
  type FindingSeverity,
} from '@paperandslate/eom-core/findings';

export interface ValidationResult {
  readonly valid: boolean;
  readonly structuralValid: boolean;
  readonly semanticValid: boolean;
  readonly schema?: string;
  readonly findings: readonly Finding[];
}

export function hasErrors(findings: readonly Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'error');
}
