# Monorepo Architecture

## Goal

Provide a language-neutral standard with a high-quality TypeScript reference implementation while keeping package boundaries clear enough for independent consumers.

## Workspace

Recommended:

- pnpm workspaces;
- Turborepo task graph;
- strict TypeScript;
- ESM-first packages;
- explicit browser and Node entry points;
- no hidden network calls;
- no runtime dependency from core parsing to paperandslate.org.

## Dependency direction

```text
schemas/vocabularies
        ↓
      types
        ↓
       core
      ↙    ↘
validator  signatures
    ↓         ↓
  linter   generator
       ↘    ↙
          cli
          ↓
 docs/playground/conformance
```

Rules:

- schemas cannot depend on runtime packages;
- generated types depend conceptually on schemas only;
- core must not depend on CLI/UI;
- validator may depend on core and schemas;
- generator may depend on validator;
- CLI composes libraries but contains little business logic;
- apps consume packages through public APIs.

## Package responsibilities

### `@paperandslate/eom-types`

Generated declarations and safe constants. No validators.

### `@paperandslate/eom-core`

- resource parsing;
- strict JSON duplicate-key rejection;
- normalization helpers;
- ID/reference utilities;
- localized text helpers;
- date/effective-period utilities;
- safe resource graph model;
- no URL fetching by default.

### `@paperandslate/eom-validator`

- JSON Schema compilation;
- structural result model;
- semantic validation;
- graph/reference validation;
- offline schema catalog;
- optional safe remote schema policy disabled by default.

### `@paperandslate/eom-linter`

- privacy rules;
- accessibility quality;
- freshness;
- provenance quality;
- likely bad IDs;
- course catalog quality;
- operational HTTP audit integration.

### `@paperandslate/eom-generator`

- source discovery;
- YAML/JSON/CSV adapters;
- authoring normalization;
- deterministic merge;
- reference resolution;
- output partitioning;
- resource descriptors;
- build manifest;
- provenance/evidence import;
- reproducibility report.

### `@paperandslate/eom-signatures`

- RFC 8785 canonicalization;
- digest;
- detached JWS;
- key-set parsing;
- delegation-aware verification;
- test vectors.

### `@paperandslate/eom-cli`

- stable command UX;
- JSON output mode;
- exit codes;
- local/URL input;
- config discovery;
- no logic unavailable to library users.

### `@paperandslate/eom-testkit`

- fixture loaders;
- local HTTP test server;
- malicious response fixtures;
- conformance assertions;
- golden-file helpers;
- deterministic clocks.

### `@paperandslate/eom-schemaorg-adapter`

- EOM to Schema.org JSON-LD;
- mapping warnings/loss report;
- no reverse inference without a separate reviewed importer.

## Apps

### Docs

Static specification/adoption documentation.

### Playground

Client-side validation and exploration for pasted/uploaded data. URL fetching may use a hardened server proxy because browsers face CORS restrictions.

### Conformance runner

Runs test suites and emits machine-readable reports.

## Build outputs

Packages should emit:

- ESM;
- type declarations;
- source maps;
- package exports map;
- provenance/SBOM;
- no bundled private configuration.

## Configuration

Shared config package may include lint/TS settings, but avoid publishing it unless useful externally.

## Node/browser boundary

Browser-safe:

- core parsing;
- local structural validation;
- local semantic validation;
- visualization helpers.

Node-only:

- filesystem generator;
- safe network fetcher;
- CLI;
- signing with private keys;
- CI conformance server.

Use conditional exports and tests for both environments.
