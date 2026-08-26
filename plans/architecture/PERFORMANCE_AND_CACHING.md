# Performance, Scale, and Caching

## Performance goals

- minimal manifest validates quickly in browser;
- root retrieval under normal CDN latency;
- large catalogs stream or chunk;
- no full graph fetch unless consumer requests it;
- repeated validation uses schema and HTTP caches.

## Root limits

Target under 256 KiB uncompressed. Linter warnings before hard consumer limit.

## Catalog partitioning

Options:

- one file for small catalogs;
- alphabetical chunks;
- department chunks;
- academic-year snapshots;
- resource index;
- API pagination.

Partition strategy is declared so clients do not guess.

## HTTP caching

Use:

- strong ETag for byte identity;
- Last-Modified;
- public Cache-Control;
- stale-while-revalidate;
- immutable caching for versioned historical snapshots;
- shorter caching for jobs/events/meals.

## Graph cache

Cache key includes:

- canonical URL;
- ETag/digest;
- protocol/schema version;
- retrieval time;
- delegation/root context.

Do not reuse a signed resource under a different authority context without re-evaluating delegation.

## Validation cache

Compile schemas once. Cache semantic indexes by resource digest.

## Generator scale

Support at least:

- district with 500 schools;
- 10,000 courses;
- multi-language values;
- 100,000 events in archived chunks.

Benchmarks should use synthetic fixtures.

## Browser tool limits

Warn and recommend CLI for large files. Use Web Workers for validation when practical.

## Denial-of-service controls

- bounded errors;
- bounded refs;
- cycle detection;
- max nesting;
- max strings/items;
- timeouts;
- cancellation;
- decompression protection.

## Benchmark reporting

Track:

- build time;
- validation time;
- peak memory;
- output size;
- docs bundle size;
- CLI startup;
- signature operations.

Avoid optimizing by weakening validation.
