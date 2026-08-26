# Reference Implementation Strategy

## Purpose

The TypeScript implementation demonstrates the specification and provides practical tools. It must not create undocumented protocol rules.

## Vertical slices

### Slice 1

Minimal manifest and organization profile.

### Slice 2

Course catalog.

### Slice 3

Modular generator/CODEOWNERS.

### Slice 4

District multi-school and delegation.

### Slice 5

All modules and Ecme High.

### Slice 6

Provenance/agent workflow.

### Slice 7

Signatures.

## Public API design

Examples:

```ts
import { validatePublication } from "@paperandslate/eom-validator";

const result = await validatePublication(input, {
  profile: "core-publisher-1.0",
  network: "offline"
});
```

```ts
import { buildPublication } from "@paperandslate/eom-generator";

const report = await buildPublication({
  configFile: "eom.config.yaml"
});
```

APIs return typed result objects and findings. Avoid throwing for expected validation failures.

## Error handling

Throw only for:

- programmer misuse;
- unrecoverable IO/internal errors.

Return findings for invalid user data.

## Resource graph

Build an immutable graph:

- entities by ID;
- resources by ID/URL;
- edges;
- source/authority context;
- findings;
- lazy resource loading.

## Plugins/adapters

Adapter interface:

- detect input;
- extract candidate;
- map fields;
- emit evidence;
- never publish;
- declare permissions/network needs;
- version and source.

Core generation remains deterministic without plugins.

## Telemetry

No telemetry by default. If future tools add opt-in telemetry:

- explicit;
- content-free;
- privacy documented;
- easily disabled.

## API stability

Before 1.0 packages may evolve. After 1.0:

- semantic versioning;
- deprecation;
- compatibility tests;
- API report.

## Independent implementation guide

The specification must be implementable without TypeScript libraries. Publish:

- pseudocode;
- JSON Schema;
- test fixtures;
- HTTP behavior;
- signature test vectors;
- conformance runner protocol.
