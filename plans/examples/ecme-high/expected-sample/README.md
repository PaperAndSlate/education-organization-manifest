# Expected Generated Sample

This directory illustrates the intended generated publication layout for Ecme High School.

It is a **planning fixture**, not a frozen normative v1 fixture. The implementation phase must:

1. finalize schemas and semantic rules;
2. regenerate every file from `source-sample/`;
3. remove fields that do not conform;
4. calculate real digests only over generated fixture bytes;
5. generate test-only keys/signatures through deterministic test tooling;
6. run the conformance suite;
7. record all deviations from this planning sample.

The file at `.well-known/educational-organization-manifest` intentionally has no extension because it represents the proposed well-known endpoint path.

Every origin and entity is fictional and uses `.example`.
