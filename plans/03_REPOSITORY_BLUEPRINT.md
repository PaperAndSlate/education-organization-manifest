# Target Repository Blueprint

## Proposed repository

`paperandslate/educational-organization-manifest`

## Repository purpose

One repository should contain the normative specification, schemas, reference TypeScript implementation, CLI, generator, conformance suite, documentation site, playground, and examples. The future public index/API and the future school website/CMS belong in separate repositories.

## Proposed layout

```text
.
├── AGENTS.md
├── README.md
├── CONTRIBUTING.md
├── GOVERNANCE.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── LICENSE
├── LICENSES/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── eslint.config.*
├── prettier.config.*
├── .editorconfig
├── .gitignore
├── .gitattributes
├── .npmrc
├── .nvmrc
├── .changeset/
├── .github/
│   ├── CODEOWNERS
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── dependabot.yml or renovate.json
│   └── workflows/
├── spec/
│   ├── index.md
│   ├── 1.0/
│   │   ├── specification.md
│   │   ├── protocol.md
│   │   ├── data-model.md
│   │   ├── conformance.md
│   │   ├── security.md
│   │   ├── privacy.md
│   │   ├── internationalization.md
│   │   └── iana-registration.md
│   ├── rfcs/
│   └── adrs/
├── schemas/
│   ├── 1.0/
│   │   ├── manifest.schema.json
│   │   ├── common/
│   │   ├── modules/
│   │   └── profiles/
│   ├── latest/
│   └── catalog.json
├── vocabularies/
│   ├── core/
│   ├── identifier-schemes/
│   ├── organization-types/
│   ├── resource-types/
│   └── jurisdiction-profiles/
├── packages/
│   ├── types/
│   ├── core/
│   ├── validator/
│   ├── linter/
│   ├── generator/
│   ├── signatures/
│   ├── cli/
│   ├── testkit/
│   ├── schemaorg-adapter/
│   └── config/
├── apps/
│   ├── docs/
│   ├── playground/
│   └── conformance-runner/
├── examples/
│   ├── minimal-school/
│   ├── ecme-high/
│   ├── district-multi-school/
│   ├── multilingual-school/
│   ├── delegated-vendor/
│   └── signed-school/
├── fixtures/
│   ├── valid/
│   ├── invalid/
│   ├── security/
│   ├── migrations/
│   └── signatures/
├── prompts/
│   ├── generation/
│   ├── maintenance/
│   ├── review/
│   └── implementation/
├── scripts/
│   ├── generate-types.*
│   ├── build-schemas.*
│   ├── verify-reproducibility.*
│   ├── check-links.*
│   ├── build-example.*
│   └── release.*
└── docs/
    ├── adoption/
    ├── integrations/
    ├── operations/
    └── methodology/
```

## Source of truth

The target repository must define clear source-of-truth rules:

- normative prose is under `spec/<major.minor>/`;
- JSON Schema files are normative for structural validity;
- semantic constraints in normative prose are implemented in `validator` and `linter`;
- vocabularies are versioned data artifacts;
- generated TypeScript types are never hand-edited;
- generated website documentation is not normative by itself;
- examples are informative unless explicitly marked as conformance fixtures;
- YAML is an authoring convenience, not the canonical wire format;
- generated JSON is deterministic.

## Repository technology

Recommended baseline:

- active LTS Node.js version at implementation time, pinned;
- pnpm workspace;
- TypeScript in strict mode;
- Turborepo for task orchestration and caching;
- JSON Schema 2020-12;
- Ajv for structural validation;
- Vitest for unit and integration tests;
- Commander or an equivalent stable CLI framework;
- a maintained YAML parser;
- `jose` or another audited JOSE implementation for signatures;
- Astro Starlight or another accessible static documentation framework;
- Changesets for package releases;
- GitHub Actions for CI;
- Renovate or Dependabot for dependency maintenance.

Codex must verify current package health, licensing, Node support, and security before pinning dependencies.

## Package boundaries

### `schema`

Published schemas and schema catalog. No runtime dependency on TypeScript.

### `types`

Generated TypeScript types from canonical schemas. No handwritten independent model.

### `core`

Resource loading, normalization, identifiers, references, language helpers, and safe URL resolution.

### `validator`

JSON Schema validation plus cross-resource semantic checks.

### `linter`

Quality and policy checks that may be warnings rather than structural failures.

### `generator`

Merges modular source files, resolves ownership metadata, normalizes authoring shorthands, creates deterministic JSON, indexes resources, and emits build reports.

### `signatures`

Canonicalization, content digests, detached signatures, key sets, verification, rotation, and test vectors.

### `cli`

Stable user-facing commands over the library packages.

### `testkit`

Fixtures, custom assertions, local static servers, and conformance harnesses.

### `schemaorg-adapter`

One-way projection from EOM public data into Schema.org JSON-LD. It must never become the source of truth for EOM.

## Separate future repositories

- `paperandslate/eom-index` — crawler, source snapshots, normalized public API, search.
- `paperandslate/school-site` — website and catalog product.
- optional language SDK repositories after the TypeScript reference stabilizes.
