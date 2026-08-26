# EOM 1.0 Optional Integrity and Signatures

Signatures are optional. The baseline is HTTPS origin control. A signing implementation parses strict canonical JSON, normalizes the published model, applies RFC 8785 JCS, and signs UTF-8 bytes using an allowlisted algorithm such as Ed25519 through JOSE. Detached JWS sidecars avoid recursive signatures. Content digests verify bytes; signatures verify key possession; root/delegation context verifies authority.

Key sets carry key ID, algorithm, purpose, owner/scope, validity, status, revocation, successor, and provenance. Verification reports canonicalization, digest, cryptographic validity, key temporal/revocation state, delegation scope, root authority, expiry, and overall policy separately. Unknown critical headers, weak algorithms, duplicate keys, changed content, wrong resources, expired/revoked keys, and out-of-scope signatures fail. Unsigned conformant v1 remains valid.
