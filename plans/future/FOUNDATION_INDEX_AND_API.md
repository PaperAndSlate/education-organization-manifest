# Future paper&slate EOM Index and API

## Repository boundary

Build in a separate repository after EOM draft stability:

`paperandslate/eom-index`

The index is a convenience observer. It is not the authority for a school's data.

## Inputs

- direct organization submissions;
- approved government organization registries;
- discovered manifests;
- revalidation queues;
- correction/opt-out requests.

## Core pipeline

```text
submission/discovery
→ origin and identity checks
→ safe fetch
→ raw observation/digest
→ EOM validation
→ authority/delegation resolution
→ claim extraction
→ identity resolution
→ conflict-preserving normalized index
→ search/API/bulk releases
```

## Required properties

- SSRF-safe crawler;
- politeness/rate limits;
- identifiable user agent;
- source observations and timestamps;
- no silent overwrites;
- historical snapshots or digests;
- correction and opt-out;
- origin revalidation;
- stale-state handling;
- data license/terms tracking;
- privacy incident removal;
- reproducible bulk dataset releases.

## API possibilities

```text
GET /organizations
GET /organizations/{id}
GET /organizations/{id}/resources
GET /organizations/{id}/courses
GET /courses
GET /programs
GET /changes
GET /sources/{observation}
```

The API should expose:

- origin claims;
- normalized fields;
- provenance;
- validation/freshness;
- conflict state;
- observation history;
- license/reuse metadata.

## Identity

Use EOM canonical IDs plus external identifier mappings. Do not mint a new ID merely to erase source IDs. A foundation convenience ID may exist but mappings remain first-class.

## Search and ranking

Avoid opaque school quality scores. Rank search relevance, not educational quality, unless a transparent, appropriate measure is explicitly requested and sourced.

## Publication outputs

- documented API;
- versioned bulk JSON/Parquet/CSV as appropriate;
- change feed;
- data dictionary;
- provenance manifest;
- release checksums;
- correction log;
- coverage/staleness dashboard.

## Governance

Index-specific policies should cover:

- inclusion/exclusion;
- correction timelines;
- source licensing;
- archival;
- conflict display;
- sensitive aggregate data;
- commercial reuse;
- takedowns;
- algorithmic ranking.
