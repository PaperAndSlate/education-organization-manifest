# Ecme High Deployment Topology

## Origins

```text
https://ecme-high.example
  /.well-known/educational-organization-manifest
  /eom/1.0/organization.json
  /eom/1.0/departments.json
  /eom/1.0/courses/index.json
  /eom/1.0/programs.json
  /eom/1.0/calendar.json
  /eom/1.0/events.json
  /eom/1.0/facilities.json
  /eom/1.0/services.json
  /eom/1.0/policies.json
  /eom/1.0/admissions.json
  /eom/1.0/sports.json
  /eom/1.0/clubs.json
  /eom/1.0/news.json
  /eom/1.0/statistics.json
  /eom/1.0/api-services.json
  /eom/1.0/keys.json
  /eom/1.0/conformance.json

https://district.ecme.example
  /eom/1.0/schools/ecme-high/transportation.json
  /eom/1.0/schools/ecme-high/jobs.json

https://menus.school-services.example
  /customers/ecme-high/eom/1.0/menus.json
```

## Build and release flow

```text
owned YAML source + approved imported candidates
→ review
→ deterministic generator
→ schema/semantic/privacy checks
→ canonical JSON
→ optional signatures
→ static deployment
→ endpoint audit
→ conformance report
```

## Caching

- root manifest: moderate freshness with revalidation;
- organization/course catalog: longer cache plus explicit modified/effective dates;
- events/news/jobs/menus/transport: shorter cache;
- immutable schemas/specs: long immutable cache;
- revocation/key metadata: refresh policy suitable for security changes.

The implementation should encode module-specific recommendations rather than hard-code these example values into the protocol.

## Failure behavior

A meal vendor outage must not invalidate the root or course catalog. Consumers show the menu module as unavailable and retain appropriate last-known metadata according to policy.

A signature failure is distinct from a network failure. A delegated resource outside scope is rejected even if it is valid JSON.
