export type FindingSeverity = 'error' | 'warning' | 'info';

export type FindingCategory =
  | 'syntax'
  | 'structural'
  | 'semantic'
  | 'privacy'
  | 'security'
  | 'freshness'
  | 'integrity'
  | 'transport'
  | 'quality';

export interface Finding {
  readonly code: string;
  readonly severity: FindingSeverity;
  readonly category: FindingCategory;
  readonly message: string;
  readonly resource?: string;
  readonly pointer?: string;
  readonly related?: readonly string[];
  readonly help?: string;
}

export function finding(
  code: string,
  category: FindingCategory,
  message: string,
  options: Omit<Partial<Finding>, 'code' | 'category' | 'message'> = {},
): Finding {
  return { code, category, message, severity: options.severity ?? 'error', ...options };
}
