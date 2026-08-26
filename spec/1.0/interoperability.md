# EOM 1.0 interoperability mappings

Status: working-draft preview. These mappings describe paper&slate adapter behavior; they do not claim conformance, certification, endorsement, or semantic equivalence with an external standard.

## Adapter contract

An adapter MUST identify its source format and version, target (`eom-authoring-candidate`), direction, supported EOM modules, public-field allowlist, transformations, loss report, provenance behavior, privacy behavior, and fixture. Official adapters in this repository are versioned in [`mappings/registry.json`](../../mappings/registry.json) and currently have `status: preview`.

The pipeline is deliberately narrow:

```text
local source text/JSON
→ source-specific allowlist
→ mapping claims and evidence metadata
→ EOM authoring candidate
→ human review
→ canonical generator
```

Adapters never publish a canonical resource directly. Claims produced by a mapping have `method.kind: mapping`, `authorityClass: unknown`, `privacyClass: public-review-required`, and a pending review state. A consumer MUST treat the candidate and claims as review input, not as an approved publication.

## Supported mappings

| Source                         | Repository format      | Direction             | Scope                                              | Important loss boundary                                             |
| ------------------------------ | ---------------------- | --------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Schema.org / JSON-LD 1.1       | `schema-org-jsonld`    | import/export preview | organization, course, event, job, news             | arbitrary extensions and private operational fields are omitted     |
| CEDS-aligned public projection | `ceds-json`            | import/export preview | organization, campus, department, course, calendar | person-level and operational records are excluded                   |
| Ed-Fi public projection        | `ed-fi-json`           | import preview        | organization, campus, course, program              | students, staff HR, enrollment, grades, and attendance are excluded |
| OneRoster public allowlist     | `oneroster-json-csv`   | import preview        | organization, course, offering, calendar           | users, enrollments, results, grades, and credentials are excluded   |
| CASE                           | `case-json`            | import preview        | standards alignment references                     | frameworks and assessment responses remain external                 |
| QTI                            | `qti-xml`              | import preview        | public assessment metadata                         | answer keys, secure item bodies, and responses are excluded         |
| LTI                            | `lti-public-json`      | import preview        | public service/documentation metadata              | secrets, private keys, tokens, and launch data are excluded         |
| Common Cartridge               | `common-cartridge-xml` | import preview        | public package metadata                            | the package is never fetched or treated as the EOM course           |
| iCalendar / RFC 5545           | `icalendar`            | import/export preview | public events, offerings, calendars                | attendee contacts and private organizer data are excluded           |
| JSON Feed, RSS, Atom           | `json-feed-rss-atom`   | import preview        | public news/event items                            | executable enclosures and private author data are excluded          |

## Safety and privacy

The official implementation uses explicit allowlists and never copies an input object wholesale. Prohibited key shapes cause quarantine before candidate creation. XML and feed text are metadata-only inputs: DTDs, entities, scripts, event handlers, and active embeds are rejected. No external URL, package, archive, stylesheet, or link is followed automatically.

Adapters preserve external identifiers as an `externalIdentifier` candidate claim when a source identifier is not an absolute URI. They do not silently replace the source identifier with an EOM identifier. Identifier resolution, source verification, effective-date interpretation, and owner authorization remain review decisions.

## Maturity and external claims

All official mappings are `preview`. Stable status requires documented semantics, compatibility coverage, privacy review, a maintenance owner, and versioned fixtures. Round-trip equivalence is not promised when source and target models differ. Mapping tests are paper&slate interoperability tests and are not CEDS, Ed-Fi, 1EdTech, CASE, QTI, LTI, Common Cartridge, Schema.org, iCalendar, RSS, Atom, or JSON Feed certification.
