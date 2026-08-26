# HTTP and Discovery Design

## Canonical discovery request

```http
GET /.well-known/educational-organization-manifest HTTP/1.1
Host: school.example
Accept: application/json
```

## Required schemes

Conforming public publishers must support HTTPS.

HTTP may be used only to redirect permanently to HTTPS. Consumers should not process an HTTP response body as authoritative EOM data.

## GET behavior

A publisher must return one of:

- `200 OK` with a valid manifest;
- `301 Moved Permanently` or `308 Permanent Redirect` to the canonical manifest;
- `404 Not Found` when EOM is not implemented;
- `410 Gone` when a previously published manifest has been intentionally retired, ideally with a successor link.

Temporary redirects may be supported operationally but should not define long-term authority.

## HEAD behavior

A conforming publisher should support `HEAD` and return the same metadata headers as `GET`, excluding the body.

## Redirect rules

Consumer requirements:

- maximum five redirects by default;
- detect loops;
- require HTTPS after the first redirect;
- record every redirect hop;
- enforce SSRF protections after every DNS resolution and redirect;
- warn on cross-origin redirect;
- reject userinfo in redirect URIs;
- reject non-HTTP(S) schemes;
- allow cross-origin canonical locations only when the original authority explicitly redirects and the final manifest accurately declares scope;
- preserve the original discovery origin as the authority anchor.

Publisher recommendation:

Use a same-origin stable well-known endpoint even when the body is generated elsewhere. Prefer direct `200` responses when practical.

## Response headers

Recommended response:

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Language: en-US
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
ETag: "..."
Last-Modified: ...
Access-Control-Allow-Origin: *
Content-Digest: sha-256=:...:
Link: <https://paperandslate.org/spec/eom/1.0>; rel="profile"
Link: <https://school.example/.well-known/educational-organization-manifest>; rel="canonical"
Vary: Accept, Accept-Language
```

Do not include `Vary: Origin` when using the wildcard CORS policy unless operationally required.

## CORS

Because EOM is public data intended for reuse, publishers should send:

`Access-Control-Allow-Origin: *`

Do not require cookies or authentication. Do not send `Access-Control-Allow-Credentials: true` with the wildcard.

## Content negotiation

V1 must always support canonical JSON.

Optional alternatives may include:

- YAML for human viewing;
- HTML documentation;
- JSON-LD projection;
- compressed or bulk formats.

The well-known GET request with `Accept: application/json` must remain deterministic and machine-readable.

Avoid language negotiation that changes identifier-bearing structure unpredictably. Prefer multilingual values in one resource or explicit alternate resources declared in the manifest.

## Caching

Publishers should provide:

- `ETag`;
- `Last-Modified`;
- reasonable `Cache-Control`;
- stable canonical URLs;
- validators for conditional requests.

Consumers should use conditional requests and preserve observation timestamps.

Freshness guidance should be module-specific:

- organization profile: days;
- course catalog: hours to days;
- calendar/events: minutes to hours;
- meal menus: minutes to hours;
- news and jobs: minutes to hours;
- emergency transport alerts: EOM is not a real-time emergency channel.

## Size limits

Recommended limits:

- root manifest: target under 256 KiB uncompressed;
- individual resource: target under 5 MiB uncompressed;
- consumer hard default: 10 MiB uncompressed unless explicitly configured;
- nesting depth: bounded;
- string length: bounded by schema and linter;
- compression ratio: guarded against decompression bombs.

Large catalogs should use resource indexes and chunks.

## Error representation

The well-known endpoint does not need to return EOM-formatted errors. Tooling APIs may use RFC 9457 Problem Details.

The CLI and validator should normalize errors into:

- transport;
- syntax;
- structural;
- semantic;
- policy/privacy;
- integrity/signature;
- freshness;
- conformance.

## Scope discovery for district-hosted school pages

A district may host many schools under one origin:

`https://district.example/schools/ecme-high`

The origin-level manifest should point to an `organization-index` containing stable canonical page URLs and profile/resource links for each school.

A school page may additionally include:

```html
<link
  rel="describedby"
  type="application/json"
  href="https://district.example/eom/organizations/ecme-high.json">
```

The HTML link is supplementary. The well-known root remains the primary origin discovery mechanism.

## Robots and crawlers

EOM is designed for deliberate public discovery. Publishers should not block the well-known endpoint in `robots.txt`. Consumers must still respect legal restrictions, rate limits, terms, and explicit opt-out metadata for foundation indexing.

## Availability and monitoring

Publisher tooling should provide:

- endpoint health check;
- schema validation on deployment;
- stale-resource detection;
- broken-link detection;
- TLS certificate and redirect checks;
- response-size and caching audit;
- alerting when the root becomes invalid.
