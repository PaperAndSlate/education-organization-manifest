# Privacy and Public Publication Policy

## Fundamental assumption

Anything in EOM is public, machine-readable, redistributable in practice, and likely to be cached.

## Prohibited data

EOM must prohibit:

- student names or identifiers;
- student contact details;
- individual grades;
- individual attendance;
- behavioral or discipline information;
- IEP, 504, SEN, disability, medical, safeguarding, or accommodation records;
- individual student schedules;
- private transportation assignments;
- financial-aid records;
- private applicant data;
- authentication credentials;
- internal network details;
- private employee records;
- emergency plans that create security risk.

These prohibitions apply to extensions and evidence published publicly.

## Staff directory

A person may be published only when:

- the organization deliberately chooses to publish them;
- the fields are already intended for public institutional use;
- the organization has a lawful policy and review process;
- removal and correction are possible;
- personal home contact data is excluded.

Prefer:

```json
{
  "role": "Registrar",
  "email": "registrar@school.example"
}
```

over a named individual.

## Publication flags

Person records should support:

- `publicationStatus`;
- `publishedByPolicy`;
- `reviewedAt`;
- `expires`;
- `contactScope`;
- `suppressFromIndex`;
- `correctionContact`.

Do not encode sensitive reasons for suppression.

## Aggregated statistics

Allowed only when:

- publicly authorized;
- sufficiently aggregated;
- time period is clear;
- source is declared;
- small-cell suppression is respected;
- categories do not enable re-identification.

The core should include `suppressed`, `suppressionReasonCode`, and `minimumCellPolicy` metadata without revealing suppressed values.

## Transportation

Allowed:

- public routes;
- public stops;
- public service areas;
- eligibility policies;
- general schedules;
- public alerts.

Prohibited:

- which student rides which bus;
- home pickup coordinates tied to a student;
- driver private contact details;
- access codes or live vehicle security data.

## Staff/course schedules

A school may publish course offering times and instructors if already public. Tooling should warn that detailed recurring staff schedules can create safety and privacy concerns.

## Facilities and security

Do not publish:

- access-control details;
- alarm zones;
- camera placements;
- emergency response vulnerabilities;
- keys or codes;
- detailed floor plans marked private.

## Agent review

Agent extraction must run a privacy classifier/linter before creating a candidate.

Required review categories:

- likely student data;
- personal contact information;
- sensitive staff data;
- security-sensitive facility data;
- private URLs;
- tokens/credentials;
- copyrighted source excerpts;
- low-confidence identity matches.

## Retention and correction

Publisher guidance should include:

- named correction route;
- review schedule;
- expiry for staff/jobs/events;
- deletion workflow;
- historical archive policy;
- index correction/opt-out request.

## Legal neutrality

The protocol cannot guarantee compliance with FERPA, GDPR, UK GDPR, COPPA, state privacy law, employment law, or local policy. Documentation should require publishers to obtain appropriate legal and governance review.

## Linter severity

### Errors

- likely student identifier structures;
- secrets/tokens;
- private IP/internal hostnames in public endpoints;
- prohibited sensitive record types.

### High warnings

- personal email/phone outside approved public fields;
- staff record without review date;
- precise recurring personal schedule;
- very small demographic cells;
- non-public document links.

### Informational

- role contact preferred;
- stale job or event;
- no correction contact;
- broad indexing permission without explicit license.
