# EOM 1.0 delegation and optional signatures

The HTTPS root origin is the baseline authority anchor. A cross-origin resource is accepted only when an active, time-bounded, non-transitive root delegation covers its resource type or id, final origin, path, and (when present) subject. Source-file ownership and publication authority remain separate. A delegated vendor or district is never the school identity.

Signatures are optional. Unsigned conformant v1 resources remain valid. A detached signature adds portable integrity but does not prove that claims are factually true. Verification reports canonicalization, digest match, cryptographic validity, key time/revocation, subject binding, resource expiry, delegation scope, and root authority separately.

The stable test profile uses RFC 8785-compatible JCS bytes and a detached RFC 7797-style compact JWS with `alg: EdDSA`, an Ed25519 public key, `b64: false`, and critical EOM profile metadata. Unknown critical headers, `none`, weak algorithms, private key material in a public key set, duplicate JSON keys, changed values, wrong keys, expired/revoked keys, and out-of-scope authority fail. Private key material is accepted only as an explicit sign input and is never written to fixtures or generated public output.

`@paperandslate/eom-authority` evaluates delegation without network access. `@paperandslate/eom-signatures` signs and verifies in memory or from explicit local files. CLI `sign` writes only an explicit detached sidecar path; CLI `verify` reads local resource, signature, and key-set files and returns exit code `5` for signature/security policy failure. No command retrieves keys or publishes signatures implicitly.
