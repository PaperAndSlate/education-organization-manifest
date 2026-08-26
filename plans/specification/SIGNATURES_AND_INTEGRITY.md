# Optional Signatures and Integrity

## V1 position

Signatures are designed and implemented in v1 but remain optional.

HTTPS origin control is the baseline authority mechanism. Signatures add portable integrity, delegated-key verification, offline verification, and stronger mirror provenance.

## Standards basis

Plan around:

- JSON Canonicalization Scheme, RFC 8785;
- JSON Web Signature, RFC 7515;
- unencoded/detached payload support, RFC 7797;
- JSON Web Key, RFC 7517;
- Ed25519 JOSE support, RFC 8037;
- Digest Fields, RFC 9530;
- HTTP Message Signatures, RFC 9421, as an optional transport enhancement.

A security RFC must finalize exact serialization and algorithm requirements before stable release.

## Canonicalization

Before signing canonical EOM JSON:

1. parse under strict JSON/I-JSON rules;
2. reject duplicate object keys;
3. reject non-finite numbers;
4. normalize to the published canonical model;
5. apply RFC 8785 JCS;
6. sign the resulting UTF-8 bytes.

Authoring YAML is never signed directly.

## Detached signature

Preferred v1 design:

- canonical JSON resource remains unchanged;
- detached JWS is published as a sidecar or referenced signature resource;
- protected header includes `alg`, `kid`, content type, and required critical parameters;
- signed resource descriptor includes the signature URI;
- exact signing input has public test vectors.

Avoid embedding a signature in the signed JSON because of recursive canonicalization.

## Algorithm

Initial recommended algorithm: EdDSA with Ed25519.

Requirements:

- algorithm allowlist;
- no `none`;
- no shared-secret MAC for public verification;
- crypto-agility registry;
- reject unknown critical headers;
- document library interoperability.

## Key set

Root manifest may link a JWKS-like key-set resource.

Key metadata:

- `kid`;
- algorithm;
- public key;
- purpose;
- owner;
- delegation scope;
- valid from/until;
- status;
- revocation time;
- replacement key;
- provenance.

Private keys never appear in source or generated repositories.

## Digest

Resource descriptors may carry a digest compatible with RFC 9530 representation.

HTTP responses should provide `Content-Digest` where operationally practical.

Digest verifies bytes, not authority. Signature verifies possession of a key, not whether the key is authorized. Delegation/root context supplies authorization.

## Verification result model

CLI output should distinguish:

- canonicalization success;
- digest match;
- signature cryptographic validity;
- key temporal validity;
- key revocation;
- delegation scope validity;
- root authority status;
- resource expiry;
- overall policy result.

Do not return one ambiguous boolean.

## Key rotation

Support:

- overlapping old/new keys;
- scheduled activation;
- explicit expiry;
- revocation;
- successor key;
- re-signing current resources;
- historical verification with archived key metadata.

## Compromise response

Document:

1. remove compromised key from active use;
2. publish revocation metadata at the root authority;
3. rotate manifests/resources;
4. invalidate caches where possible;
5. issue a security advisory;
6. retain historical evidence;
7. notify indexes and consumers.

## HTTP Message Signatures

May be added for end-to-end response metadata integrity, but cannot replace stable detached signatures for cached files because intermediaries and transport context differ.

## Test vectors

Fixtures must cover:

- valid signed resource;
- changed whitespace before canonicalization;
- changed semantic value;
- wrong key;
- expired key;
- revoked key;
- signature outside delegation scope;
- unknown critical header;
- malicious duplicate JSON keys;
- non-canonical number edge cases;
- key rotation.
