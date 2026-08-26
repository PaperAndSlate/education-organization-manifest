# Phase 6: delegation and optional signatures

Status: implemented locally as a working draft. This report is evidence of repository behavior, not a claim of external registration, institutional authorization, or production deployment.

## Delivered

- root-origin and scoped cross-origin authority evaluation;
- object or URI delegate identities, subject binding, resource type/id, origin/path, validity, revocation, and non-transitive checks;
- vendor meals and district transportation fixtures;
- RFC 8785-compatible canonical JSON profile with duplicate-key rejection;
- SHA-256 content digest and detached RFC 7797-style JWS profile using Ed25519/EdDSA;
- public-only key-set metadata with key validity, revocation, successor, owner, purpose, and scope fields;
- independent verification dimensions for canonicalization, digest, crypto, key lifecycle, subject, expiry, delegation, and root authority;
- stable CLI `sign` and `verify` operations with explicit local files and exit code 5 for security-policy failure;
- unsigned-valid behavior and public-only committed signature vector.

## Evidence

- `packages/authority/src/index.ts`
- `packages/signatures/src/index.ts`
- `schemas/1.0/delegation.schema.json`
- `schemas/1.0/key-set.schema.json`
- `schemas/1.0/signature.schema.json`
- `fixtures/delegation/`
- `fixtures/signatures/`
- `tests/authority-signatures.test.ts`
- `spec/1.0/delegation-signatures.md`

## Boundaries

No private key is stored in the repository. No live key fetch, provider acceptance, external pilot, IANA registration, production TLS/cache behavior, or deployment is claimed. Cross-origin authority without a supplied manifest context is reported as not evaluated, not silently trusted.
