# CLI Design

## Binary

Preferred: `eom`

## UX principles

- safe defaults;
- no hidden publishing;
- machine-readable output;
- actionable errors;
- stable exit codes;
- explicit network access;
- dry-run support;
- reproducible behavior;
- redacted logs.

## Commands

### `eom init`

Create a starter project.

Options:

- minimal school;
- district;
- rich school;
- language;
- origin;
- modules;
- GitHub ownership template.

### `eom build`

Generate canonical public resources.

Options:

- config;
- output;
- module;
- organization;
- sign;
- dry-run;
- deterministic verification;
- report path.

### `eom validate`

Validate file, directory, URL, or origin.

### `eom lint`

Run quality/privacy/freshness rules.

### `eom check`

Convenience command: build in temp, validate, lint, check links, compare generated drift.

### `eom inspect`

Human-readable resource graph and capability summary.

### `eom fetch`

Safely retrieve and cache a public manifest graph. Must use hardened fetch policies.

### `eom diff`

Semantic differences between versions/snapshots:

- added/removed entities;
- changed fields;
- effective-date changes;
- breaking publication changes;
- provenance changes.

### `eom migrate`

Apply supported schema migration.

### `eom sign`

Sign canonical generated resources. Requires explicit key input and refuses source YAML.

### `eom verify`

Verify digest/signature/delegation/root context.

### `eom conformance`

Run selected conformance profile and emit report.

### `eom schema`

List, print, or locate bundled schemas.

### `eom explain <finding-code>`

Explain a validator/linter result.

### `eom doctor`

Audit environment, configuration, URL hosting, CORS, cache headers, and deployment output.

## Global options

- `--json`;
- `--quiet`;
- `--verbose`;
- `--no-color`;
- `--offline`;
- `--config`;
- `--cache-dir`;
- `--timeout`;
- `--max-bytes`.

## Configuration precedence

1. CLI flags;
2. environment for operational settings only;
3. project config;
4. user config;
5. defaults.

Do not allow environment variables to silently alter semantic source data.

## Logging

- stdout for primary result;
- stderr for diagnostics;
- no secrets/private keys;
- URL query redaction when needed;
- structured debug logs;
- no evidence excerpts unless explicit.

## Shell completion

Generate completion for common shells after command API stabilizes.

## Version reporting

`eom --version` should include CLI, schema catalog, and supported protocol versions.
