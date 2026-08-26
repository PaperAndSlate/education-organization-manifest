# Aggregate Statistics and Public Data

## Principle

Statistics are observations, not timeless organization fields.

## Observation model

Fields:

- id;
- subject;
- metric;
- value;
- unit;
- dimensions;
- period;
- observedAt;
- publishedAt;
- source;
- methodology;
- revision;
- confidence/quality;
- suppression;
- license;
- provenance.

## Example metrics

- aggregate enrollment;
- attendance rate;
- graduation/completion rate;
- student-teacher ratio;
- staff count;
- course participation;
- public ratings/inspection outcomes;
- facility counts.

Metrics require namespaced definitions. “Attendance rate” is meaningless without method and period.

## Dimensions

Examples:

- education level;
- campus;
- academic year;
- program;
- demographic category only where lawful, public, and sufficiently aggregated.

## Suppression

```json
{
  "suppressed": true,
  "suppressionReason": "small-cell",
  "policy": "https://authority.example/statistical-disclosure-policy"
}
```

Do not include the hidden value.

## Ratings and inspections

Model:

- rating scheme;
- rating value;
- issuing body;
- inspection date;
- report URL;
- effective status;
- scope;
- methodology link.

Do not normalize unrelated rating systems into one universal score without a documented crosswalk.

## Derived data

Foundation-derived metrics must declare:

- input sources;
- algorithm/method version;
- calculation time;
- uncertainty;
- known limitations.

## Revisions

Statistics can be revised. Preserve:

- original publication;
- revision number/date;
- supersededBy;
- reason.

## Dataset use

A future foundation index may expose normalized observations through an API and bulk dataset, always retaining source-level records.
