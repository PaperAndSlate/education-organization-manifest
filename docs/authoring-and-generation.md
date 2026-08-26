# Authoring and deterministic generation

The reference generator turns a small YAML source tree into a validated EOM publication. It is offline-first: source parsing, schema validation, privacy linting, normalization, canonical serialization, and output writing do not require a network or credentials.

## Minimal configuration

```yaml
project:
  name: Example School EOM
  protocolVersion: '1.0'
  defaultLanguage: en-US
publisher:
  origin: https://school.example
  manifestPath: /.well-known/educational-organization-manifest
source:
  root: source
  modules:
    organization: [organization.yaml]
    courses: [courses/**/*.yaml]
output:
  root: generated/public
signing:
  enabled: false
```

Configuration is validated against `schemas/1.0/config.schema.json`. Source files are resolved relative to `source.root`, sorted by normalized path, and assigned to exactly one registered module. YAML uses the core schema, rejects duplicate keys and aliases, limits file size and nesting, and accepts only JSON-compatible values. JSON source files use the strict duplicate-key parser.

## Build stages

The generator normalizes authoring shorthand, converts stable URI strings to entity references where the wire schema requires them, merges items by module, rejects duplicate IDs, constructs the compact root manifest, runs structural/semantic/privacy checks, and writes canonical resources atomically. Unknown wire fields remain validation errors; they are never silently published.

Generated output contains:

- `public/.well-known/educational-organization-manifest` and a JSON-addressable alias;
- `public/eom/*.json` independently validatable resources;
- `build/input-manifest.json` with source paths and SHA-256 digests;
- `build/output-manifest.json` and `build/reproducibility.json`;
- `build/validation.json`, `build/lint.json`, `build/source-map.json`, and `build/build-report.json`.

Course authoring keeps reusable definitions separate from offerings and sections. Course items can express education levels, structured `allOf`/`oneOf` prerequisites, corequisites, credits, workload, outcomes, standards, delivery, materials, fees and waivers, lifecycle/replacement relationships, and catalog versions. Publication-set validation resolves course, department, program, academic-period, offering, campus, facility, and public-instructor references; it also rejects prerequisite cycles, overlapping course-code periods, and occurrence-specific schedule data embedded in a reusable course.

Build reports use relative paths and content digests so identical source/config inputs can be compared across directories. Generated public output is not written when a blocking finding is present. A dry run performs all discovery and validation without replacing the output directory.

## Commands

```powershell
pnpm eom build examples/ecme-high/source/eom.config.yaml --output examples/ecme-high/generated/public --json
pnpm examples:build
pnpm verify:determinism
pnpm verify:examples
```

The Ecme High source is synthetic. Generated files are disposable build products and must not be edited directly; change the YAML source and regenerate instead.
