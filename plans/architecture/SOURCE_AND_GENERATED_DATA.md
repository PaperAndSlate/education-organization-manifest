# Source and Generated Data Contract

## Objective

Allow teams to own small, human-readable files while publishing normalized, deterministic resources.

## Source layout

A deployment project may use:

```text
eom/
  eom.config.yaml
  source/
    organization.yaml
    campuses/
    departments/
    courses/
    offerings/
    programs/
    calendars/
    events/
    facilities/
    services/
    policies/
    admissions/
    sports/
    transportation/
    meals/
    clubs/
    jobs/
    news/
    statistics/
    api/
  imports/
  evidence/
  reviews/
  generated/
  reports/
```

## Source format

Primary: YAML.

Also:

- JSON;
- approved CSV mappings for table-like collections;
- adapter-generated candidate JSON.

YAML parser policy:

- safe schema only;
- aliases/anchors bounded;
- no custom object construction;
- file and nesting size limits;
- duplicate-key rejection;
- explicit date handling to avoid implicit type surprises.

## Generated output

```text
generated/
  public/
    .well-known/
      educational-organization-manifest
    eom/
      organization.json
      courses/
      ...
  build/
    input-manifest.json
    output-manifest.json
    validation.json
    lint.json
    provenance.json
    reproducibility.json
```

Non-deterministic timestamps belong under `generated/build`, not canonical public JSON unless they represent a real content observation.

## Ownership metadata

Source ownership comes from:

- GitHub CODEOWNERS;
- optional `owners.yaml`;
- directory defaults;
- object-level steward metadata.

Ownership metadata is not necessarily published.

## Overlays

Supported only when explicit.

Example order:

1. imported base;
2. jurisdiction normalization;
3. department-maintained values;
4. central publication overrides.

Every overlay:

- lists allowed JSON Pointer paths;
- has an owner;
- records provenance;
- cannot erase a conflict silently;
- is visible in build report.

## Secrets

No secrets in source. Signing key paths and provider credentials come from environment or secret manager.

## Generated-file policy

- generated files carry a header or manifest marker;
- CI regenerates and compares;
- manual changes fail;
- output order is stable;
- line endings and encoding pinned;
- canonical JSON has no pretty-print ambiguity for signing;
- a human pretty JSON copy may be emitted separately if documented.

## Publication modes

- static copy into website public directory;
- object storage/CDN;
- framework route returning generated file;
- serverless endpoint;
- vendor-hosted delegated resource.

The generator creates deployable artifacts but does not assume one hosting platform.
