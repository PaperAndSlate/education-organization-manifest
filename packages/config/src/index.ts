export type EomProtocolVersion = '1.0';

export interface EomProjectConfig {
  readonly name: string;
  readonly protocolVersion: EomProtocolVersion;
  readonly defaultLanguage: string;
  readonly supportedLanguages?: readonly string[];
}

export interface EomPublisherConfig {
  readonly origin: string;
  readonly manifestPath: string;
  readonly organizationId?: string;
  readonly organizationType?: string;
  readonly organizationName?: string | Record<string, unknown>;
}

export interface EomSourceImportConfig {
  readonly module: string;
  readonly patterns: readonly string[];
}

export interface EomSourceOverlayConfig {
  readonly name: string;
  readonly owner: string;
  readonly priority: number;
  readonly modules: Readonly<Record<string, readonly string[]>>;
  readonly allowedPointers: readonly string[];
}

export interface EomSourceConfig {
  readonly root: string;
  readonly modules: Readonly<Record<string, readonly string[]>>;
  /** Explicit additional source files, always resolved below source.root. */
  readonly imports?: readonly EomSourceImportConfig[];
  /** Compatibility alias for imports; it follows the same restricted policy. */
  readonly includes?: readonly EomSourceImportConfig[];
  /** Ordered, field-allowlisted overlays applied to existing stable IDs. */
  readonly overlays?: readonly EomSourceOverlayConfig[];
  readonly ownershipByDirectory?: boolean;
}

export interface EomOutputConfig {
  readonly root: string;
  readonly canonicalJson?: boolean;
  readonly prettyPrint?: boolean;
  readonly sourceMaps?: boolean;
  readonly buildManifest?: boolean;
}

export interface EomValidationConfig {
  readonly profiles?: readonly string[];
  readonly privacyLint?: boolean;
  /** Module names whose public-data review was explicitly acknowledged by an owner. */
  readonly privacyAcknowledgements?: readonly string[];
  readonly failOn?: readonly ('error' | 'warning' | 'info')[];
  readonly warnOnMissingFreshness?: boolean;
}

export interface EomPublicationConfig {
  readonly modified?: string;
  readonly expires?: string;
  readonly indexingPolicy?: Record<string, unknown>;
  readonly notice?: string | Record<string, unknown>;
}

export interface EomSigningConfig {
  readonly enabled: boolean;
  readonly keyFile?: string;
  readonly keyId?: string;
}

export interface EomConfig {
  readonly project: EomProjectConfig;
  readonly publisher: EomPublisherConfig;
  readonly source: EomSourceConfig;
  readonly output: EomOutputConfig;
  readonly validation?: EomValidationConfig;
  readonly publication?: EomPublicationConfig;
  readonly signing?: EomSigningConfig;
  readonly maxBytes?: number;
}

export const defaultConfig = {
  validation: {
    privacyLint: true,
    failOn: ['error'] as const,
    warnOnMissingFreshness: true,
  },
  output: {
    canonicalJson: true,
    prettyPrint: true,
    sourceMaps: true,
    buildManifest: true,
  },
  maxBytes: 256 * 1024,
} as const;
