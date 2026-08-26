# Generator Pipeline

## Pipeline stages

1. configuration load;
2. source discovery;
3. parser safety checks;
4. authoring-shorthand normalization;
5. identity assignment/validation;
6. module-specific normalization;
7. overlay and merge;
8. relationship graph construction;
9. provenance/evidence attachment;
10. privacy preflight;
11. structural validation;
12. semantic validation;
13. linting;
14. resource partitioning;
15. manifest/resource descriptor generation;
16. canonical serialization;
17. digest/signature optional;
18. output write;
19. reproducibility and build report.

## Configuration

Example:

```yaml
protocolVersion: "1.0"
origin: https://ecme-high.example
publisher: ./source/organization.yaml
output: ./generated/public
defaultLanguage: en-US
modules:
  courses:
    sources:
      - ./source/courses/**/*.yaml
    ownershipByDirectory: true
signing:
  enabled: false
```

## Stable IDs

Generator strategies:

- explicit IDs preferred;
- configured ID base plus stable slug;
- never derive ID solely from translated name;
- ID changes require migration/supersession;
- collision is a hard error.

## Normalization

Examples:

- authoring language maps to canonical localized structure;
- local course references to absolute IDs;
- dates to explicit strings;
- currency/quantity normalization;
- extension shorthand to namespace URI;
- source paths to provenance records.

## Deterministic merge

Rules:

- lexicographic source ordering after normalized paths;
- object identity by absolute ID;
- explicit overlay priorities;
- no filesystem-order dependence;
- stable array ordering either semantic or explicitly preserved;
- stable JSON property ordering via canonicalization.

## Privacy preflight

Before publication:

- scan prohibited fields;
- detect student-like records;
- detect secrets;
- flag personal contact;
- flag internal domains/IPs;
- flag overly precise transportation/facility data;
- require review acknowledgements for selected modules.

## Partial builds

Support:

- one module;
- one organization;
- changed files;
- validation-only;
- dry run.

A partial build must still evaluate dependencies and produce a clear “not a full publication” report.

## Build cache

Cache parsed/normalized source by content digest, tool version, and config digest. Never reuse cache across incompatible schema versions.

## Output atomicity

Write to a temporary directory, validate final graph, then atomically replace publication output. Avoid leaving a half-updated root that points to missing resources.

## Build report

Include:

- tool version;
- schema/spec versions;
- config digest;
- source list/digests;
- generated resource list/digests;
- warnings/errors;
- overrides;
- unresolved conflicts;
- privacy acknowledgements;
- signature results;
- deterministic build fingerprint.

## Failure policy

No output publication on:

- parse errors;
- duplicate IDs;
- structural errors;
- semantic errors;
- prohibited privacy findings;
- signature failure when signing requested;
- unresolved required references.

Warnings may publish only under configured policy and are recorded.
