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

export interface EomSourceConfig {
  readonly root: string;
  readonly modules: Readonly<Record<string, readonly string[]>>;
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
  readonly enabled: false;
  readonly keyFile?: string;
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
