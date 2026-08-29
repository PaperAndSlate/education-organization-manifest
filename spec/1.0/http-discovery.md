# EOM 1.0 HTTP discovery and retrieval

The canonical discovery path is `/.well-known/educational-organization-manifest`. A conforming public publisher serves it over HTTPS with `GET`, a JSON content type, and a compact EOM manifest. `HEAD` is recommended and should return equivalent metadata without a body. HTTP may redirect permanently to HTTPS; an HTTP response body is not authoritative EOM data.

The reference consumer follows at most five redirects by default, records each hop, rejects loops, userinfo, non-HTTP(S) schemes, private or reserved DNS answers, non-default ports, and missing JSON content types. It rechecks the destination before every hop, does not forward cookies or authorization, enforces response, aggregate-cache-byte, and operation-time limits, and requires HTTPS for every redirect destination. Cross-origin redirects are retained as observable metadata; they do not replace the original origin authority.

Publishers should send `Content-Type: application/json`, `Access-Control-Allow-Origin: *`, public cache directives, `ETag` or `Last-Modified`, a protocol profile link, and a canonical link. Wildcard CORS must not be combined with credentialed CORS. Consumers should preserve retrieval time, response validators, redirect history, and the original discovery origin.

The CLI `fetch` command is the explicit network boundary. All local validation, schema inspection, generation, and test fixtures work offline. Live DNS, TLS, cache, redirect, and hosting acceptance cannot be claimed from the repository’s local tests and remain an external deployment gate.
