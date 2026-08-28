export interface BrowserValidationFinding {
  readonly code: string;
  readonly category: string;
  readonly message: string;
  readonly pointer?: string;
  readonly severity?: string;
}

export interface BrowserValidationResult {
  readonly valid: boolean;
  readonly structural: boolean;
  readonly semantic: boolean;
  readonly findings: readonly BrowserValidationFinding[];
}

export interface BrowserSemanticDiff {
  readonly changed: boolean;
  readonly breaking: boolean;
  readonly changes: readonly Record<string, unknown>[];
}

export interface BrowserSignatureVerificationResult {
  readonly overall: boolean;
  readonly keyScopeValid: boolean;
  readonly findings: readonly string[];
}

export interface BrowserSignatureVerificationOptions {
  readonly now?: Date | string;
  readonly manifest?: unknown;
  readonly resource?: unknown;
  readonly authorityResource?: unknown;
  readonly finalUrl?: string;
  readonly observedRootUrl?: string;
}

export function semanticDiffBrowser(before: unknown, after: unknown): BrowserSemanticDiff;
export function validateBrowserDocument(
  value: unknown,
  options?: { readonly now?: Date | string },
): BrowserValidationResult;
export function verifyDetachedBrowser(
  value: unknown,
  signature: unknown,
  keySet: unknown,
  options?: BrowserSignatureVerificationOptions,
): Promise<BrowserSignatureVerificationResult>;
