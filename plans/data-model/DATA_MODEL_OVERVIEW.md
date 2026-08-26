# Data Model Overview

## Modeling style

EOM uses linked, stable entities rather than one deeply nested school object.

Primary entity families:

- organization;
- campus;
- department;
- person and role contact;
- course;
- course offering;
- section;
- program/pathway;
- academic period;
- event;
- facility and service;
- policy/document;
- sports team;
- club;
- transport route/stop/service;
- menu/meal/menu item;
- admission process;
- job posting;
- news item;
- statistic/observation;
- API/service reference.

## Entity rules

Every reusable entity should support:

- absolute `id`;
- entity `type`;
- localized `name`;
- optional localized `description`;
- lifecycle/status;
- effective dates;
- identifiers;
- links;
- provenance;
- extensions.

## Reference rules

Use references by `id`, not copied nested objects, when:

- the entity is reused;
- independent ownership applies;
- the entity has its own lifecycle;
- duplication would cause conflicting truth.

Allow compact embedded objects when:

- the value is local to one parent;
- it has no independent identity;
- consumers do not need to reference it.

## Required versus recommended

The core must keep required fields minimal.

Typical entity requirements:

- `id`;
- `type`;
- `name` when human-facing;
- parent/subject relationship;
- effective status where relevant.

Profiles may add recommended fields. Avoid forcing schools to invent values.

## Null, missing, and unknown

- Missing: publisher did not provide the field.
- `null`: use only where the schema explicitly defines “known to have no value” or “not applicable.”
- Unknown: use a controlled status/qualifier, not empty strings.
- Empty arrays: supported but generally omit when no items exist.
- False: must not be inferred from absence.

## Dates

Use:

- date-only for academic days, deadlines, and effective calendar dates;
- RFC 3339 timestamp for exact observations and events;
- explicit time zone for schedules;
- open-ended periods by omitting `until`, not using magic dates.

## Quantities

Use objects when units matter:

```json
{
  "value": "0.5",
  "unit": "https://paperandslate.org/vocabulary/credit-systems/us-carnegie-unit"
}
```

Decimal values should be strings where precision matters.

## Status pattern

Reusable lifecycle vocabulary:

- draft;
- planned;
- active;
- suspended;
- inactive;
- deprecated;
- retired;
- closed;
- cancelled.

Each module may define a narrower profile.

## Links

Generic link object:

- `href`;
- `rel`;
- `mediaType`;
- localized title;
- language;
- purpose;
- audience;
- accessibility metadata;
- license;
- integrity.

## Extension rule

All entities may have `extensions`. No entity may allow arbitrary unknown properties outside it.

## Provenance rule

A module resource has default provenance. Individual entities may override or add provenance. Field-level maps can point into entities.

## Authoring shorthands

The generator may support:

- string references resolved to IDs;
- simple language maps;
- date shorthands;
- CSV imports;
- directory-based ownership defaults.

Published JSON must be fully normalized and schema-valid.
