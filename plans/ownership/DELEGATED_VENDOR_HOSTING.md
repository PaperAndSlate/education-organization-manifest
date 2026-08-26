# Delegated Vendor Hosting

## Use cases

- course catalog SaaS;
- meal vendor;
- transportation platform;
- athletics system;
- jobs/HR platform;
- calendar/news platform.

## Requirements

- explicit root link/delegation;
- HTTPS;
- stable URLs;
- subject organization IDs;
- vendor publisher identity;
- limited resource types;
- allowed origin/path;
- effective period;
- revocation route;
- privacy/public-data terms;
- export/exit plan;
- monitoring;
- optional signing key scope.

## Vendor contract recommendations

Operational/legal guidance, not protocol law:

- school retains data rights appropriate to source;
- public export remains available;
- no student/private records in public feed;
- update SLA;
- correction SLA;
- incident notice;
- domain and URL continuity;
- key rotation;
- deletion after termination;
- accessible output;
- conformance testing;
- version migration support.

## Consumer display

Show:

- subject: Ecme High School;
- publisher/maintainer: Vendor;
- authority: delegated by Ecme High;
- last updated;
- signature status.

Do not label vendor as the school.

## Exit workflow

1. publish replacement resource;
2. update root;
3. expire/revoke old delegation;
4. retain historical provenance;
5. redirect old URL if possible;
6. verify no stale root references;
7. archive conformance report.

## Failure handling

If delegated resource is unavailable:

- root remains valid;
- capability may be degraded;
- consumer reports module unavailable;
- do not substitute unapproved vendor data.
