import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const manifestPath = join(root, 'plans', 'pack-manifest.json');
const outputPath = join(root, 'requirements', 'plan-file-traceability.json');
const matrixPath = join(root, 'requirements', 'TRACEABILITY_MATRIX.md');

type JsonRecord = Record<string, unknown>;

type PackFile = {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
};

type ModuleRecord = {
  readonly shortName?: unknown;
  readonly resourceType?: unknown;
  readonly schema?: unknown;
  readonly example?: unknown;
};

type TraceabilityEntry = {
  readonly id: string;
  readonly planPath: string;
  readonly planSha256: string;
  readonly classification: 'normative' | 'implementation-guidance' | 'reference';
  readonly requirement: string;
  readonly evidencePaths: readonly string[];
  readonly evidenceCommands: readonly string[];
  readonly status: 'verified-local' | 'blocked-external' | 'open' | 'not-applicable';
  readonly notes?: string;
};

type AtomicRequirement = {
  readonly id: string;
  readonly requirement: string;
  readonly source: readonly string[];
  readonly evidencePaths: readonly string[];
  readonly evidenceCommands: readonly string[];
  readonly status: 'verified-local' | 'blocked-external' | 'open' | 'not-applicable';
  readonly owner?: string;
  readonly blocker?: string;
  readonly notes?: string;
};

const manifest = asRecord(JSON.parse(await readFile(manifestPath, 'utf8')));
const packFiles = asPackFiles(manifest.files);
const modules = await readModules();
const releaseReady = await isReleaseReady();
const formalSecurityReady = await isFormalSecurityReady();

const planFiles: TraceabilityEntry[] = [];
for (const [index, file] of packFiles.entries()) {
  const classification = classifyPlanFile(file.path);
  const evidence = evidenceForPlan(file.path, classification);
  const status = statusForPlan(
    file.path,
    classification,
    evidence,
    releaseReady,
    formalSecurityReady,
  );
  planFiles.push({
    id: `EOM-PLAN-${String(index + 1).padStart(3, '0')}`,
    planPath: `plans/${file.path}`,
    planSha256: file.sha256,
    classification,
    requirement: requirementForPlan(file.path, classification),
    evidencePaths: evidence.paths,
    evidenceCommands: evidence.commands,
    status,
    ...(status === 'blocked-external'
      ? { notes: 'This planning item records an external gate; local checks must not close it.' }
      : classification === 'reference'
        ? {
            notes:
              'Non-normative reference material; actionable obligations are mapped separately.',
          }
        : {}),
  });
}

const atomicRequirements = [
  aggregateModuleRequirement(),
  ...modules.map((module, index) => moduleRequirement(module, index + 1)),
  ...normativeRequirements(releaseReady, formalSecurityReady),
  ...remediationRequirements(releaseReady),
  ...releaseRequirements(releaseReady, formalSecurityReady),
];

const document = {
  version: 1,
  source: {
    manifest: 'plans/pack-manifest.json',
    expectedFileCount: packFiles.length,
    planningPackUnchanged: true,
  },
  planFiles,
  atomicRequirements,
};
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
await writeFile(matrixPath, renderMatrix(document), 'utf8');
process.stdout.write(
  `generated traceability for ${planFiles.length} planning files and ${atomicRequirements.length} atomic requirements\n`,
);

function classifyPlanFile(path: string): TraceabilityEntry['classification'] {
  const normalized = path.replaceAll('\\', '/');
  if (
    normalized.startsWith('adoption/') ||
    normalized.startsWith('future/') ||
    normalized.startsWith('templates/') ||
    normalized === 'README.md' ||
    normalized === 'PACK_INDEX.md' ||
    normalized === 'PACK_VALIDATION_REPORT.md' ||
    normalized === 'OPERATOR_HANDOFF.md' ||
    normalized === 'roadmap.md' ||
    normalized.startsWith('examples/ecme-high/expected-sample/') ||
    normalized.startsWith('examples/ecme-high/source-sample/') ||
    normalized.startsWith('examples/ecme-high/invalid-sample/') ||
    normalized.startsWith('website/')
  ) {
    return 'reference';
  }
  if (
    normalized.startsWith('architecture/') ||
    normalized.startsWith('methodology/') ||
    normalized.startsWith('agentic/') ||
    normalized.startsWith('examples/') ||
    normalized === 'CODEX_EXECUTION_PLAYBOOK.md' ||
    normalized === 'MASTER_CODEX_GOAL_PROMPT.txt'
  ) {
    return 'implementation-guidance';
  }
  return 'normative';
}

function requirementForPlan(
  path: string,
  classification: TraceabilityEntry['classification'],
): string {
  if (classification === 'reference') {
    return `Preserve plans/${path} as non-normative reference material; it does not independently assert implementation completion.`;
  }
  if (classification === 'implementation-guidance') {
    return `Use plans/${path} as implementation guidance and map each actionable obligation to executable repository evidence.`;
  }
  return `Implement and verify the normative or delivery obligations described by plans/${path}; prose alone cannot establish completion.`;
}

function evidenceForPlan(
  path: string,
  classification: TraceabilityEntry['classification'],
): { readonly paths: readonly string[]; readonly commands: readonly string[] } {
  if (classification === 'reference') return { paths: [], commands: [] };
  const normalized = path.replaceAll('\\', '/');
  if (normalized === 'specification/IANA_REGISTRATION_PLAN.md') {
    return {
      paths: ['release/registration/status.json', 'reports/external-gates.md'],
      commands: ['pnpm release:check'],
    };
  }
  if (normalized.startsWith('specification/HTTP_')) {
    return {
      paths: ['spec/1.0/http-discovery.md', 'packages/core/src/fetch.ts', 'tests/fetch.test.ts'],
      commands: ['pnpm test', 'pnpm verify:security'],
    };
  }
  if (normalized.startsWith('specification/OWNERSHIP_')) {
    return {
      paths: [
        'spec/1.0/ownership-delegation.md',
        'packages/authority/src/index.ts',
        'tests/authority-signatures.test.ts',
      ],
      commands: ['pnpm test', 'pnpm ownership:check'],
    };
  }
  if (normalized.startsWith('specification/SIGNATURES_')) {
    return {
      paths: [
        'spec/1.0/signatures.md',
        'packages/signatures/src/index.ts',
        'tests/authority-signatures.test.ts',
      ],
      commands: ['pnpm test', 'pnpm schema:check'],
    };
  }
  if (normalized.startsWith('specification/')) {
    return {
      paths: [
        'spec/1.0/protocol.md',
        'packages/validator/src/semantic.ts',
        'tests/validator.test.ts',
      ],
      commands: ['pnpm test', 'pnpm schema:check'],
    };
  }
  if (normalized.startsWith('data-model/')) {
    return {
      paths: ['modules/registry.json', 'scripts/check-modules.ts', 'tests/modules.test.ts'],
      commands: ['pnpm schema:check', 'pnpm module:check', 'pnpm vocabulary:check'],
    };
  }
  if (normalized.startsWith('delivery/')) {
    return {
      paths: [
        'requirements/plan-file-traceability.json',
        'scripts/check-traceability.ts',
        'package.json',
      ],
      commands: ['pnpm traceability:check', 'pnpm verify'],
    };
  }
  if (normalized.startsWith('governance/')) {
    return {
      paths: ['GOVERNANCE.md', 'CONTRIBUTING.md', 'scripts/lint.ts'],
      commands: ['pnpm policy:check', 'pnpm license:check'],
    };
  }
  if (normalized.startsWith('ownership/')) {
    return {
      paths: [
        '.github/CODEOWNERS',
        'docs/governance/ownership-and-review.md',
        'scripts/check-ownership.ts',
      ],
      commands: ['pnpm ownership:check'],
    };
  }
  if (normalized.startsWith('interoperability/')) {
    return {
      paths: ['mappings/registry.json', 'packages/adapters/src/index.ts', 'tests/mappings.test.ts'],
      commands: ['pnpm test', 'pnpm verify:security'],
    };
  }
  if (
    normalized.startsWith('00_') ||
    normalized.startsWith('01_') ||
    normalized.startsWith('02_')
  ) {
    return {
      paths: ['README.md', 'docs/project-status.md', 'requirements/plan-file-traceability.json'],
      commands: ['pnpm traceability:check'],
    };
  }
  return {
    paths: ['requirements/plan-file-traceability.json', 'requirements/TRACEABILITY_MATRIX.md'],
    commands: ['pnpm traceability:check'],
  };
}

function statusForPlan(
  path: string,
  classification: TraceabilityEntry['classification'],
  evidence: { readonly paths: readonly string[]; readonly commands: readonly string[] },
  releaseReady: boolean,
  formalSecurityReady: boolean,
): TraceabilityEntry['status'] {
  if (classification === 'reference' || classification === 'implementation-guidance') {
    return 'not-applicable';
  }
  if (path === 'specification/IANA_REGISTRATION_PLAN.md') return 'blocked-external';
  if (path.startsWith('delivery/') && !releaseReady) return 'open';
  if (path === 'governance/SECURITY_POLICY_PLAN.md' && !formalSecurityReady) return 'open';
  return evidence.paths.length > 0 && evidence.commands.length > 0 ? 'verified-local' : 'open';
}

function aggregateModuleRequirement(): AtomicRequirement {
  return {
    id: 'EOM-MOD-AGG-001',
    requirement:
      'The complete module registry is unique, schema-backed, versioned, privacy-classified, mapped, fixture-covered, generator-supported, and profile-tested.',
    source: [
      'spec/1.0/modules.md',
      'data-model/MODULE_REGISTRY.md',
      'delivery/DEFINITION_OF_DONE.md',
    ],
    evidencePaths: ['modules/registry.json', 'scripts/check-modules.ts', 'tests/modules.test.ts'],
    evidenceCommands: ['pnpm module:check', 'pnpm conformance:profiles'],
    status: 'verified-local',
  };
}

function moduleRequirement(module: ModuleRecord, index: number): AtomicRequirement {
  const name = stringValue(module.shortName) ?? `module-${index}`;
  const example = stringValue(module.example) ?? `examples/ecme-high/public/eom/${name}.json`;
  const schema = schemaPath(stringValue(module.schema));
  const fixtureRoot = `fixtures/modules/${name}`;
  const evidencePaths = [
    'modules/registry.json',
    schema,
    example,
    `${fixtureRoot}/valid.json`,
    `${fixtureRoot}/invalid-unknown-property.json`,
    `${fixtureRoot}/invalid-privacy.json`,
    `${fixtureRoot}/invalid-security.json`,
    `${fixtureRoot}/extension.json`,
    'scripts/check-modules.ts',
    'tests/modules.test.ts',
  ];
  return {
    id: `EOM-MOD-${String(index).padStart(3, '0')}`,
    requirement: `The ${name} module has complete structural, semantic, privacy/security, extension, mapping, generator, example, and conformance evidence.`,
    source: ['data-model/MODULE_REGISTRY.md', 'delivery/DEFINITION_OF_DONE.md'],
    evidencePaths,
    evidenceCommands: ['pnpm module:check', 'pnpm conformance:profiles'],
    status: 'verified-local',
  };
}

function normativeRequirements(
  releaseReady: boolean,
  formalSecurityReady: boolean,
): readonly AtomicRequirement[] {
  const definitions: readonly [string, string, readonly string[], readonly string[]][] = [
    [
      'EOM-NORM-001',
      'HTTPS discovery, redirect, content-type, cache, CORS, DNS binding, and resource limits are bounded and observable.',
      ['spec/1.0/http-discovery.md', 'packages/core/src/fetch.ts', 'tests/fetch.test.ts'],
      ['pnpm test', 'pnpm verify:security'],
    ],
    [
      'EOM-NORM-002',
      'Root manifests are compact and link independently optional resource modules.',
      ['spec/1.0/protocol.md', 'schemas/1.0/manifest.schema.json', 'tests/validator.test.ts'],
      ['pnpm schema:check', 'pnpm test'],
    ],
    [
      'EOM-NORM-003',
      'Identifiers, origins, paths, canonical URLs, and references are absolute and scope-safe.',
      ['spec/1.0/protocol.md', 'packages/core/src/ids.ts', 'tests/validator.test.ts'],
      ['pnpm test'],
    ],
    [
      'EOM-NORM-004',
      'Resource envelopes, capabilities, indexes, lifecycle, and module relationships are structurally valid.',
      ['schemas/1.0/catalog.json', 'scripts/check-schemas.ts', 'tests/modules.test.ts'],
      ['pnpm schema:check', 'pnpm module:check'],
    ],
    [
      'EOM-NORM-005',
      'Language tags, direction, localized values, and international education profiles are supported.',
      ['spec/1.0/internationalization.md', 'packages/core/src/localized.ts', 'tests/core.test.ts'],
      ['pnpm test'],
    ],
    [
      'EOM-NORM-006',
      'Course definitions are separated from offerings and prerequisite graphs are checked.',
      ['spec/1.0/data-model.md', 'packages/validator/src/semantic.ts', 'tests/validator.test.ts'],
      ['pnpm test'],
    ],
    [
      'EOM-NORM-007',
      'Privacy and publication safety exclude student/private data and security-sensitive fields.',
      ['spec/1.0/privacy.md', 'packages/linter/src/index.ts', 'scripts/security-check.ts'],
      ['pnpm verify:security', 'pnpm test'],
    ],
    [
      'EOM-NORM-008',
      'Provenance, evidence, conflicts, review states, freshness, and candidate gating preserve uncertainty.',
      [
        'spec/1.0/provenance-conflicts.md',
        'packages/agentic/src/index.ts',
        'tests/agentic.test.ts',
      ],
      ['pnpm test'],
    ],
    [
      'EOM-NORM-009',
      'Delegation is explicit, scoped, time-bounded, revocable, subject-bound, key-aware, and non-transitive by default.',
      [
        'spec/1.0/ownership-delegation.md',
        'packages/authority/src/index.ts',
        'tests/authority-signatures.test.ts',
      ],
      ['pnpm test', 'pnpm ownership:check'],
    ],
    [
      'EOM-NORM-010',
      'Signatures use canonical JSON, structured protected lifetime metadata, exact sidecar binding, key lifecycle, subject, and cryptographic checks.',
      [
        'spec/1.0/signatures.md',
        'packages/signatures/src/index.ts',
        'tests/authority-signatures.test.ts',
      ],
      ['pnpm test', 'pnpm schema:check'],
    ],
    [
      'EOM-NORM-011',
      'Versioned schemas, vocabularies, extensions, compatibility, and migrations are immutable and testable.',
      ['spec/1.0/versioning.md', 'schemas/1.0/catalog.json', 'vocabularies/registry.json'],
      ['pnpm schema:check', 'pnpm vocabulary:check'],
    ],
    [
      'EOM-NORM-012',
      'Authoring generation is deterministic, safe against path replacement, and supports full, module, organization, and changed-files modes.',
      ['spec/1.0/generation.md', 'packages/generator/src/index.ts', 'tests/generator.test.ts'],
      ['pnpm test', 'pnpm verify:determinism'],
    ],
    [
      'EOM-NORM-013',
      'Validation and linting expose stable, actionable findings and machine-readable report formats.',
      ['spec/1.0/validation.md', 'packages/validator/src/reports.ts', 'tests/validator.test.ts'],
      ['pnpm test'],
    ],
    [
      'EOM-NORM-014',
      'CLI commands and global operational limits have stable behavior and usage exit codes.',
      ['spec/1.0/cli.md', 'packages/cli/src/index.ts', 'tests/cli.test.ts'],
      ['pnpm test', 'pnpm typecheck'],
    ],
    [
      'EOM-NORM-015',
      'Mappings preserve identifiers, privacy boundaries, loss reports, and review status.',
      ['spec/1.0/interoperability.md', 'mappings/registry.json', 'tests/mappings.test.ts'],
      ['pnpm test'],
    ],
    [
      'EOM-NORM-016',
      'Conformance profiles evaluate publisher, consumer, generator, validator, module, delegation, and signature behavior.',
      [
        'spec/1.0/conformance.md',
        'conformance/registry.json',
        'scripts/run-conformance-profiles.ts',
      ],
      ['pnpm conformance:check', 'pnpm conformance:profiles'],
    ],
    [
      'EOM-NORM-017',
      'Browser tools use the browser-safe engine, avoid uploads by default, and meet automated accessibility/security checks.',
      [
        'plans/architecture/DOCUMENTATION_AND_PLAYGROUND.md',
        'apps/playground/src/browser-engine.js',
        'tests/browser.spec.ts',
      ],
      ['pnpm test:browser', 'pnpm docs:check'],
    ],
    [
      'EOM-NORM-018',
      'Release evidence is revision-bound, reproducible, checksummed, licensed, and status-honest.',
      [
        'spec/1.0/release.md',
        'scripts/check-release.ts',
        'scripts/check-release-reproducibility.ts',
      ],
      ['pnpm release:check', 'pnpm verify:release-reproducibility'],
    ],
  ];
  return definitions.map(([id, requirement, source, evidenceCommands]) => ({
    id,
    requirement,
    source,
    evidencePaths: source.slice(1),
    evidenceCommands,
    status:
      (id === 'EOM-NORM-018' && !releaseReady) || (id === 'EOM-NORM-007' && !formalSecurityReady)
        ? 'open'
        : 'verified-local',
  }));
}

function remediationRequirements(releaseReady: boolean): readonly AtomicRequirement[] {
  const requirements: readonly [string, string, readonly string[], readonly string[]][] = [
    [
      'EOM-REM-001',
      'Published packages resolve only compiled files and bundled schema assets.',
      ['scripts/check-packages.ts', 'packages/schema/package.json'],
      ['pnpm packages:check'],
    ],
    [
      'EOM-REM-002',
      'Generator output replacement is confined to compatible marked roots and selectors.',
      ['packages/generator/src/index.ts', 'tests/generator.test.ts'],
      ['pnpm test'],
    ],
    [
      'EOM-REM-003',
      'Network connections cannot be redirected to a private address after DNS validation.',
      ['packages/core/src/fetch.ts', 'tests/fetch.test.ts'],
      ['pnpm test'],
    ],
    [
      'EOM-REM-004',
      'All module registry and vocabulary records are schema-validated and versioned.',
      ['modules/registry.json', 'vocabularies/registry.json', 'scripts/check-modules.ts'],
      ['pnpm module:check', 'pnpm vocabulary:check'],
    ],
    [
      'EOM-REM-005',
      'Every v1 module has dedicated valid, invalid, privacy, security, extension, and conformance evidence.',
      ['scripts/check-modules.ts', 'fixtures/modules'],
      ['pnpm module:check', 'pnpm conformance:profiles'],
    ],
    [
      'EOM-REM-006',
      'CLI, migration, diff, graph, and report interfaces match the planning contract.',
      ['packages/cli/src/index.ts', 'tests/cli.test.ts'],
      ['pnpm test', 'pnpm typecheck'],
    ],
    [
      'EOM-REM-007',
      'Conformance roles test publisher, consumer, generator, validator, delegation, and signature behavior.',
      ['packages/testkit/src/index.ts', 'fixtures/conformance/expected/profiles.json'],
      ['pnpm conformance:profiles'],
    ],
    [
      'EOM-REM-008',
      'Browser validation shares the real validator and has automated accessibility coverage.',
      ['apps/playground/src/browser-engine.js', 'tests/browser.spec.ts'],
      ['pnpm test:browser'],
    ],
    [
      'EOM-REM-009',
      'CI runs real lint, CodeQL/dependency/secret checks, drift, packaging, and cross-platform gates.',
      ['.github/workflows/ci.yml', '.github/workflows/codeql.yml', 'scripts/check-action-pins.ts'],
      ['pnpm actions:check', 'pnpm lint'],
    ],
    [
      'EOM-REM-010',
      'Release artifacts are exact, reproducible, source-revision-bound, and status-honest.',
      ['scripts/generate-release-artifacts.ts', 'scripts/check-release.ts'],
      ['pnpm release:check', 'pnpm verify:release-reproducibility'],
    ],
  ];
  return requirements.map(([id, requirement, evidencePaths, evidenceCommands]) => ({
    id,
    requirement,
    source: ['MASTER_CODEX_GOAL_PROMPT.txt'],
    evidencePaths,
    evidenceCommands,
    status: id === 'EOM-REM-010' && !releaseReady ? 'open' : 'verified-local',
  }));
}

function releaseRequirements(
  releaseReady: boolean,
  formalSecurityReady: boolean,
): readonly AtomicRequirement[] {
  return [
    {
      id: 'EOM-REL-LOCAL-001',
      requirement:
        'Frozen install, build, typecheck, lint, tests, coverage, schemas, fixtures, docs, packages, security, and release checks pass through the aggregate gate.',
      source: ['delivery/RELEASE_CHECKLIST.md'],
      evidencePaths: ['package.json', 'scripts/check-traceability.ts'],
      evidenceCommands: ['pnpm verify'],
      status: releaseReady ? 'verified-local' : 'open',
    },
    {
      id: 'EOM-REL-LOCAL-002',
      requirement:
        'Cross-platform CI, CodeQL, dependency review, secret scanning, REUSE, and automated dependency maintenance are configured and pinned.',
      source: ['architecture/CI_CD_AND_RELEASE.md'],
      evidencePaths: [
        '.github/workflows/ci.yml',
        '.github/workflows/security.yml',
        '.github/dependabot.yml',
        'scripts/check-action-pins.ts',
      ],
      evidenceCommands: ['pnpm actions:check'],
      status: 'verified-local',
    },
    {
      id: 'EOM-REL-LOCAL-003',
      requirement:
        'A formal post-remediation security scan has no unresolved critical, high, medium, low, or plan-conformance security finding.',
      source: ['architecture/THREAT_MODEL.md', 'governance/SECURITY_POLICY_PLAN.md'],
      evidencePaths: ['reports/security-scan.md', 'scripts/security-check.ts'],
      evidenceCommands: ['pnpm verify:security'],
      status: formalSecurityReady ? 'verified-local' : 'open',
    },
    {
      id: 'EOM-REL-EXT-001',
      requirement:
        'The proposed well-known suffix is registered or its current status is rechecked and recorded by the responsible external owner.',
      source: ['specification/IANA_REGISTRATION_PLAN.md'],
      evidencePaths: ['release/registration/status.json'],
      evidenceCommands: [],
      status: 'blocked-external',
      owner: 'registration owner',
      blocker: 'IANA action and decision are outside this repository.',
    },
    {
      id: 'EOM-REL-EXT-002',
      requirement:
        'Independent publisher and consumer interoperability exchange evidence is supplied.',
      source: ['adoption/CONSUMER_PATTERNS.md', 'interoperability/ONE_ROSTER_CASE_QTI_LTI.md'],
      evidencePaths: ['release/pilot/README.md'],
      evidenceCommands: [],
      status: 'blocked-external',
      owner: 'pilot coordinator',
      blocker: 'Independent participants and exchange logs are not available locally.',
    },
    {
      id: 'EOM-REL-EXT-003',
      requirement: 'Legal/licensing review and stable governance approval are recorded.',
      source: ['governance/LICENSE_AND_IP_PLAN.md', 'governance/GOVERNANCE.md'],
      evidencePaths: ['reports/external-gates.md'],
      evidenceCommands: [],
      status: 'blocked-external',
      owner: 'legal/release owner and maintainers',
      blocker: 'Written external review and approval have not been supplied.',
    },
    {
      id: 'EOM-REL-EXT-004',
      requirement:
        'Production deployment, adoption, certification, and factual endorsement remain explicitly unclaimed.',
      source: ['specification/IANA_REGISTRATION_PLAN.md', 'website/MAIN_WEBSITE_COPY.md'],
      evidencePaths: ['docs/project-status.md', 'reports/external-gates.md'],
      evidenceCommands: ['pnpm release:check'],
      status: 'verified-local',
      owner: 'release authority',
      blocker:
        'Deployment and adoption are intentionally not authorized by this release candidate.',
    },
  ];
}

async function readModules(): Promise<readonly ModuleRecord[]> {
  const registry = asRecord(
    JSON.parse(await readFile(join(root, 'modules', 'registry.json'), 'utf8')),
  );
  return Array.isArray(registry.modules)
    ? registry.modules.filter((value): value is ModuleRecord => isRecord(value))
    : [];
}

function schemaPath(schema: string | undefined): string {
  if (!schema) return 'schemas/1.0/catalog.json';
  const marker = '/schemas/eom/1.0/';
  const index = schema.indexOf(marker);
  return index >= 0
    ? `schemas/1.0/${schema.slice(index + marker.length)}`
    : 'schemas/1.0/catalog.json';
}

async function isReleaseReady(): Promise<boolean> {
  try {
    const manifest = asRecord(
      JSON.parse(await readFile(join(root, 'release', 'manifest.json'), 'utf8')),
    );
    return manifest.release === '1.0.0-rc.3';
  } catch {
    return false;
  }
}

async function isFormalSecurityReady(): Promise<boolean> {
  try {
    const report = await readFile(join(root, 'reports', 'security-scan.md'), 'utf8');
    return /Formal post-remediation status:\s*pass/iu.test(report);
  } catch {
    return false;
  }
}

function renderMatrix(document: {
  readonly planFiles: readonly TraceabilityEntry[];
  readonly atomicRequirements: readonly AtomicRequirement[];
}): string {
  const lines = [
    '# EOM Requirement Traceability Matrix',
    '',
    'This file is generated from `plans/pack-manifest.json` by `pnpm generate:traceability`.',
    'The planning pack is preserved byte-for-byte. Every listed file is classified as normative,',
    'implementation guidance, or non-normative reference material. Completion requires executable',
    'evidence; report prose alone never changes a status. External gates remain blocked.',
    '',
    '## Planning-pack coverage',
    '',
    '| ID | Planning file | Classification | Requirement | Evidence commands | Status |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of document.planFiles) {
    lines.push(
      `| ${entry.id} | \`${entry.planPath}\` | ${entry.classification} | ${escapeCell(entry.requirement)} | ${entry.evidenceCommands.map((command) => `\`${command}\``).join('<br>') || '—'} | ${entry.status} |`,
    );
  }
  lines.push(
    '',
    '## Atomic requirements',
    '',
    '| ID | Requirement | Evidence | Status | Owner/blocker |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const entry of document.atomicRequirements) {
    const owner = [entry.owner, entry.blocker].filter(Boolean).join(': ') || '—';
    lines.push(
      `| ${entry.id} | ${escapeCell(entry.requirement)} | ${entry.evidencePaths.map((path) => `\`${path}\``).join('<br>')}<br>${entry.evidenceCommands.map((command) => `\`${command}\``).join('<br>') || '—'} | ${entry.status} | ${escapeCell(owner)} |`,
    );
  }
  lines.push(
    '',
    '## Status rules',
    '',
    '- `verified-local` requires the referenced files and executable commands to exist; the aggregate gate is authoritative for pass/fail.',
    '- `open` means implementation or executable evidence remains incomplete.',
    '- `blocked-external` is reserved for evidence requiring an external owner or environment.',
    '- `not-applicable` is limited to non-normative planning guidance and reference material.',
  );
  return lines.join('\n') + '\n';
}

function asPackFiles(value: unknown): readonly PackFile[] {
  if (!Array.isArray(value)) throw new Error('plans/pack-manifest.json must contain files.');
  return value.map((entry, index) => {
    const record = asRecord(entry);
    if (
      typeof record.path !== 'string' ||
      typeof record.bytes !== 'number' ||
      typeof record.sha256 !== 'string'
    ) {
      throw new Error(`Invalid planning-pack manifest entry ${index}.`);
    }
    return { path: record.path, bytes: record.bytes, sha256: record.sha256 };
  });
}

function asRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw new Error('Expected a JSON object.');
  return value;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
