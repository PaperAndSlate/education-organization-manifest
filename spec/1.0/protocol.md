# EOM 1.0 Protocol and Discovery

## Discovery

Given an educational organization HTTPS origin, a consumer requests `GET /.well-known/educational-organization-manifest` with `Accept: application/json`. A conforming origin returns `200` with a valid manifest, `301`/`308` to a canonical HTTPS location, `404` when not implemented, or `410` when intentionally retired. HTTP response bodies are not authoritative EOM data; HTTP may redirect permanently to HTTPS.

The consumer MUST cap redirects (five by default), detect loops, reject userinfo and non-HTTP(S) schemes, revalidate destination DNS/IP safety after every hop, record cross-origin hops, and preserve the original discovery origin as the authority anchor. Cross-origin final resources require explicit root linking/delegation under the authority rules.

## HTTP behavior

Publishers SHOULD support `HEAD` and return GET-equivalent metadata without a body. Public resources SHOULD provide `Content-Type: application/json`, `Access-Control-Allow-Origin: *`, validators such as `ETag`/`Last-Modified`, and suitable public cache directives. Wildcard CORS MUST NOT be combined with credentialed CORS.

The canonical response is deterministic JSON. A publisher MAY expose YAML, HTML, JSON-LD, feeds, or bulk formats as explicitly labeled alternates; alternates do not replace the canonical JSON. Consumers must record retrieval time and should honor cache/freshness metadata.

## Size and graph limits

The root target is below 256 KiB uncompressed. Implementations MUST bound resource bytes, graph depth, node count, strings, errors, decompression, and time. Large collections use an index and chunks; consumers must not assume that an omitted optional module is empty or false.

## Resource failures

Consumers report root status and per-resource status separately. An unavailable, expired, invalid, or out-of-scope optional resource does not invalidate an otherwise valid root. Findings distinguish transport, syntax, structural, semantic, privacy/security, integrity, and freshness categories.

## Caching and robots

Versioned specification/schema resources SHOULD be immutable and cacheable. Volatile feeds such as events, news, jobs, menus, and notices need shorter freshness. EOM is deliberate public discovery; publishers should not block the well-known path in `robots.txt`, while consumers remain responsible for law, terms, rate limits, and opt-out metadata.
