# Consumer Patterns

## Discovery algorithm

1. Start with a user/operator-supplied educational organization origin.
2. Normalize the origin safely.
3. Fetch `/.well-known/educational-organization-manifest`.
4. Apply HTTP safety and size limits.
5. Validate structure and supported version.
6. verify scope/canonical origin;
7. inspect organizations and capabilities;
8. select needed resources;
9. evaluate explicit delegation for cross-origin resources;
10. validate each resource independently;
11. apply freshness, provenance, and optional signature policy;
12. cache according to HTTP and protocol metadata;
13. surface failures per module rather than discarding unrelated data.

Do not discover organizations through unbounded arbitrary crawling in a basic consumer library.

## Trust display

Consumers should distinguish:

- declared by root origin;
- linked same-origin resource;
- explicitly delegated resource;
- cryptographically verified bytes;
- mirrored/indexed observation;
- stale/expired;
- structurally invalid;
- factually unverified.

“Signed” must not be displayed as “verified school quality” or “factually correct.”

## Version handling

- reject unsupported major versions unless an explicit forward-compatible mode exists;
- accept compatible minor additions according to the extension/version policy;
- do not fetch `latest` for validation of historical data;
- record the exact schema/spec version used.

## Partial failure

A broken menu should not remove courses. A consumer should expose:

- root status;
- per-resource status;
- last successful observation;
- error;
- stale fallback policy.

## Caching

Honor HTTP caching. Also consider:

- resource expiry;
- module freshness;
- delegation/key revocation;
- catalog effective periods;
- index observation history.

## UI obligations

Applications should:

- display effective/freshness dates for volatile facts;
- link to the canonical organization/source;
- provide correction path;
- communicate missing/optional modules;
- avoid false comparisons;
- distinguish course from current offering;
- respect language and accessibility metadata.

## Indexer behavior

A future index should store:

- fetched bytes/digest;
- observation time;
- parsed claims;
- source URI;
- protocol version;
- validation status;
- conflict history;
- correction/opt-out state.

It should never overwrite a claim without retaining its source observation.
