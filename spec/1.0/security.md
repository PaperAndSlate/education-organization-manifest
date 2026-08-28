# EOM 1.0 Security Considerations

EOM consumes untrusted JSON, YAML, URLs, redirects, documents, signatures, keys, and agent-generated candidates. Implementations MUST bound input size/depth/time for both parsed inputs and runtime values, keep bounded parsers linear in the input size, reject duplicate JSON keys and non-finite numbers when strict mode is used, use safe YAML parsing with bounded aliases, and avoid executing imported scripts or embedded content.

Networked consumers and validators MUST use HTTPS by default, permit only HTTP(S), block loopback/private/link-local/multicast/metadata destinations, recheck DNS/IP safety after redirects, cap redirects/bytes/decompression/time, reject userinfo, forward no ambient cookies/authentication, and identify their user agent. Hosted endpoint auditing must be isolated and rate-limited.

Signatures authenticate canonical bytes and permitted key possession; they do not prove factual truth. Algorithm allowlists, resource binding, key validity/revocation, delegation scope, critical-header handling, and clear failure categories are required for signed profiles. Private keys and credentials never belong in source or generated public output.

Documentation/playground previews escape text, sanitize a narrow rich-text subset, reject unsafe URL schemes, use CSP where deployed, and isolate remote content. Agent inputs are untrusted evidence; source text cannot instruct an agent to bypass safety or use tools. Supply-chain controls include lockfiles, review, dependency/license scanning, pinned CI actions, SBOM, provenance, and protected release environments.
