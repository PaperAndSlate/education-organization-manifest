# Testing Strategy

## Test pyramid

### Unit

- common types;
- ID normalization;
- language handling;
- effective periods;
- schema format validators;
- merge logic;
- finding codes;
- canonicalization.

### Schema fixtures

- valid/invalid per schema;
- edge values;
- unknown fields;
- extensions;
- compatibility.

### Integration

- complete source project to publication;
- validator graph;
- CLI commands;
- cross-package APIs;
- signatures;
- migration.

### HTTP

Local controlled servers:

- direct 200;
- redirects;
- CORS;
- cache validators;
- content negotiation;
- timeouts;
- oversized payload;
- wrong type;
- private network simulation.

### End-to-end

- initialize project;
- add course;
- build;
- validate;
- serve locally;
- inspect;
- sign/verify;
- conformance report.

### Fuzz/property

- parser inputs;
- JSON Pointer;
- IDs;
- language tags;
- prerequisite expressions;
- canonicalization;
- merge ordering.

## Coverage

Set meaningful thresholds but prioritize critical branch coverage:

- validator;
- delegation;
- URL fetch;
- signatures;
- privacy rules;
- generator merge.

Generated types and declarative schema data need different coverage interpretation.

## Reproducibility test

Build the same example:

- in separate directories;
- with different filesystem enumeration order;
- with fixed environment/timezone;
- twice in CI.

Compare canonical outputs byte-for-byte.

## Cross-platform

Test supported Node LTS on:

- Linux required;
- macOS;
- Windows.

Normalize paths and line endings.

## Browser tests

- local validation;
- file upload;
- large but allowed document;
- accessibility;
- RTL;
- no network dependency for local file mode.

## Mutation testing

Consider for:

- semantic validator;
- delegation;
- privacy linter;
- signature verification.

## Snapshot policy

Use snapshots only for stable reports/examples. Review snapshot changes; never update blindly.

## Test data privacy

All fixtures are fictitious and use `.example`. No production school content in the repository unless separately licensed and reviewed.
