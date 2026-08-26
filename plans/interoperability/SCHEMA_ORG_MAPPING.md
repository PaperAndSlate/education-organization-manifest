# Schema.org Mapping Plan

## Purpose

Generate search-engine and general linked-data markup from approved EOM data while preserving EOM as the richer source.

## Organization mapping

Potential EOM → Schema.org mapping:

| EOM | Schema.org |
|---|---|
| organization ID/canonical URL | `@id` / `url` |
| localized name | `name`, language-tagged JSON-LD value where supported |
| alternate names | `alternateName` |
| description | `description` |
| organization type | `@type` subtype when semantically exact |
| parent/governing organization | `parentOrganization` |
| campus/sub-organization | `subOrganization` / `department` where appropriate |
| address | `PostalAddress` |
| geo | `GeoCoordinates` |
| role contact | `ContactPoint` |
| logo/media | `logo`, `image` |
| identifiers | `identifier` / `PropertyValue` |
| founding date | `foundingDate` |
| same-as links | `sameAs` |

Do not map a district to `School` merely because it governs schools. Use `EducationalOrganization`/`Organization` as appropriate.

## Course mapping

| EOM course definition | Schema.org `Course` |
|---|---|
| ID | `@id` |
| title | `name` |
| description | `description` |
| code | `courseCode` |
| provider | `provider` |
| prerequisites | `coursePrerequisites` |
| education level | `educationalLevel` |
| language | `inLanguage` |
| credits | `numberOfCredits` only when semantically compatible |
| outcomes | `teaches` or descriptive mapping with caution |
| subjects/topics | `about` |
| standards alignment | `educationalAlignment` where appropriate |
| offerings | `hasCourseInstance` |

Do not force structured prerequisite logic into a misleading string without preserving a canonical EOM link.

## Course offering mapping

Map an EOM offering/section to `CourseInstance` when it represents a particular mode, period, or scheduled instance.

Potential fields:

- `@id`;
- `name`;
- `courseMode`;
- `startDate`;
- `endDate`;
- `location`;
- `instructor` only when deliberately public;
- `offers` for public enrollment/commercial availability only when accurate;
- `inLanguage`;
- `eventSchedule` where semantically appropriate.

A catalog statement that a course “may be offered” is not necessarily a scheduled `CourseInstance`.

## Other modules

- EOM event → `Event` subtype where exact.
- EOM job → `JobPosting`.
- EOM news item → `NewsArticle` only when it is actually an article.
- EOM sports team → `SportsTeam` when the public entity fits.
- EOM menu → generally no complete direct mapping; use page-level markup cautiously.
- transport routes → no forced mapping.
- policies/documents → `DigitalDocument`/`CreativeWork` only where useful.

## JSON-LD generation

- Use deterministic context and ordering for tests, while recognizing JSON-LD semantic equivalence does not depend on key order.
- Link all generated entities back to canonical EOM IDs.
- Do not publish extension data into arbitrary Schema.org properties.
- Include only public fields.
- Test generated JSON-LD with syntax and mapping fixtures.
- Record EOM source digests in build metadata, not necessarily public JSON-LD.

## Loss report

Every generator run should be able to report:

- EOM fields mapped exactly;
- fields mapped approximately;
- fields omitted;
- fields requiring text flattening;
- mapping warnings.

This prevents the Schema.org projection from becoming an accidental second source of truth.
