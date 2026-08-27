# EOM 1.0 Data Model

## Common envelope

Module resources use a common conceptual envelope containing immutable `$schema`, `specification`, `version`, `id`, `type`, `canonical`, publisher/subject context, optional default language, effective period, provenance, and namespaced extensions. A resource may use a collection `items` or module-specific collection fields. The schema for each resource type is authoritative for the exact shape.

## Resource families

Core resource types are `manifest`, `organization-profile`, `organization-index`, `resource-index`, `key-set`, and `conformance-report`. EOM 1.0 school modules are `campus-catalog`, `department-catalog`, `staff-directory`, `contact-directory`, `course-catalog`, `course-offering-catalog`, `program-catalog`, `academic-calendar`, `event-catalog`, `facility-catalog`, `service-catalog`, `policy-catalog`, `admissions-profile`, `sports-catalog`, `transportation-catalog`, `meal-menu-catalog`, `club-catalog`, `job-catalog`, `news-feed`, `statistics-profile`, and `api-reference`.

Every reusable entity SHOULD have an absolute `id`, a discriminating `type`, localized human-facing names when applicable, status/lifecycle, effective dates, links, provenance, and extensions. Reused entities are referenced by ID rather than copied, unless the embedded value has no independent identity or lifecycle.

## Course boundary

A course is a durable educational definition. An offering describes availability in a period, mode, location, cohort, or other context. A section is a concrete scheduled/administrative subdivision. Course definitions MUST NOT acquire live seats, private schedules, rooms, or instructor details merely because an offering has them. Structured prerequisite expressions preserve boolean meaning and are checked for cycles.

## International and public boundary

Language tags are BCP 47. Localized values preserve official scripts and translation provenance. Addresses, education levels, credits, academic periods, currency, time zones, and classifications are jurisdiction-aware. Staff records are deliberate-public only and role contacts are preferred. Statistics are observations with method, period, source, and suppression metadata. No entity or extension may publish prohibited student, private employee, credential, internal endpoint, or security-sensitive operational data.

## Provenance and ownership

Provenance can apply to a resource, object, or JSON Pointer field. Source ownership in an authoring repository is distinct from publication authority. An origin can explicitly delegate a resource type/resource ID to another origin and path for a bounded period. Delegation is non-transitive by default.
