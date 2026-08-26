# CEDS and Ed-Fi Mapping Plan

## Scope

Provide documented, versioned public projections between EOM and relevant CEDS/Ed-Fi concepts. These mappings are advisory unless an independently maintained adapter is implemented and tested.

## Shared concepts

Likely overlap includes:

- education organization;
- school;
- local education agency/district;
- campus/location;
- contact/address;
- academic subject;
- course;
- course offering;
- section;
- school year/session/term;
- calendar/date;
- program;
- education level/grade;
- staff identity/assignment in limited public form;
- official identifiers.

## Key boundary

CEDS and Ed-Fi can model extensive private operational data. EOM must not import or expose:

- students;
- enrollments tied to people;
- grades;
- attendance;
- discipline;
- disability/special-program participation;
- individual schedules;
- credentials or private staff HR data.

The adapter must use an explicit public-field allowlist, never a “copy all available fields” strategy.

## Mapping registry

For each mapping record:

- EOM schema/version;
- external standard/version;
- EOM JSON Pointer;
- external path/element;
- direction;
- exact/approximate/transform/lossy;
- transformation;
- vocabulary mapping;
- privacy classification;
- fixture;
- maintainer;
- reviewed date.

## Education organization identity

Do not replace external IDs with EOM IDs. Preserve:

- EOM canonical URI;
- Ed-Fi/CEDS identifier with scheme;
- issuing authority;
- effective dates;
- verified source.

Entity resolution should use official IDs plus origin/address/relationship checks.

## Course vs offering vs section

The mapping must preserve:

```text
EOM Course          ↔ durable course definition
EOM CourseOffering  ↔ course availability in school/year/session/context
EOM Section         ↔ concrete scheduled instructional instance
```

An adapter must not collapse all three into one record.

## Calendar mapping

Map school year, session/term, calendar, and calendar date only where effective periods/timezones align. Record differences in recurrence and instructional-day semantics.

## Staff mapping

Default public export should use role contacts or a deliberately public allowlist. Do not export internal staff identifiers or assignments unless the school has explicitly approved those fields for publication.

## Adapter architecture

Recommended:

```text
connector
→ source-version parser
→ public-field allowlist
→ normalized intermediate model
→ EOM entity resolution
→ evidence ledger
→ candidate authoring files
→ review
```

## Tests

- exact mapping fixture;
- missing optional fields;
- multiple schools/campuses;
- code reuse across years;
- grade/education-level crosswalk;
- course offering/section separation;
- private-field rejection;
- identifier collision;
- historical effective dates;
- round-trip loss report.

Round-trip equivalence should not be promised when the source and target models differ.
