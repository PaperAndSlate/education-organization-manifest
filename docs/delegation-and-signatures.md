# Delegation and signatures

EOM distinguishes the root publisher, source maintainer, delegated publisher, and signer. HTTPS origin control is the ordinary authority mechanism; signatures are an optional portable integrity layer.

## Delegation

Use a root `delegations` entry for a vendor- or district-hosted resource. Scope it by resource type/id, allowed HTTPS origin, path prefix, and subject, and set a validity window and `status: active`. Stable v1 rejects transitive delegation. Revocation is represented by `status: revoked` or a past `revokedAt`; the old record remains useful historical evidence. The authority evaluator returns a trust label (`root-linked`, `delegated`, or `unverified-external`) and independent scope diagnostics.

## Detached integrity

Sign canonical JSON bytes, never authoring YAML. The sidecar binds the resource `subject`, `keyId`, JCS profile, digest, protected header, and Ed25519 signature. A key-set contains public-only JWK metadata and can record validity, revocation, successor, owner, and scope. A digest confirms bytes; a signature confirms possession of a private key; root/delegation context confirms publication authority; none of these proves factual correctness.

Verification is intentionally multi-dimensional. `overall` is true only when every applicable integrity, key, subject, expiry, and authority check passes. If no authority context is supplied, the result says `rootAuthorityStatus: not-evaluated` rather than claiming authority. An unsigned v1 resource can still pass ordinary EOM validation.

The committed public-only vector is under `fixtures/signatures/`; vendor meals and district transportation delegation examples are under `fixtures/delegation/`. Tests generate additional keys in memory and verify a signature through both Node crypto and WebCrypto. Live key hosting, TLS, institutional authorization, rotation operations, and production revocation distribution remain external deployment gates.
