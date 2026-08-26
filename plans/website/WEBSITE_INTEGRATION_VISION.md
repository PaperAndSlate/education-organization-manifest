# Website Integration Vision

## Separation of concerns

EOM is a neutral protocol repository. The paper&slate website, documentation portal, future school website product, future foundation index, and any third-party school system are separate implementations.

Recommended repositories:

```text
paperandslate/educational-organization-manifest   protocol, schemas, tooling
paperandslate/eom-docs                           optional standalone docs/tool deployment
paperandslate/education-index                     future crawler, index, and API
paperandslate/school-sites                        future school website/catalog product
```

A monorepo may host the protocol documentation and browser tools initially, but their runtime architecture must not make protocol conformance depend on paperandslate.org.

## Shared-data vision

Approved educational organization data should support multiple outputs:

```text
reviewed EOM authoring source
├── canonical EOM JSON
├── school website pages
├── course catalog search
├── printable/PDF catalog input
├── API responses
├── Schema.org JSON-LD
├── embeddable course/program cards
├── feeds and calendars
├── accessibility exports
└── foundation index submission
```

The website product should not maintain a parallel hidden course schema. It may add presentation configuration, page composition, branding, campaigns, and private workflow state, but public institutional facts should map to EOM.

## Integration modes

### Read-only consumer

A website fetches a school's published EOM resources and renders:

- school profile;
- departments;
- courses;
- programs;
- events;
- jobs;
- news;
- menus;
- other enabled modules.

### Managed publisher

A school edits data through a CMS. The product stores structured authoring data, routes approvals, generates EOM, and publishes the root manifest on the school's own origin.

### Hybrid

The product imports authoritative resources from district or vendor systems, combines them with school-owned modules, records provenance, and publishes delegated links.

### Static generator

A repository-based school builds EOM and static site assets through CI/CD.

### API adapter

An SIS, LMS, CMS, calendar, menu, or transport system maps an existing public API into one EOM module.

## Publisher-origin requirement

The ideal public endpoint is controlled by the educational organization's domain, even when a vendor operates the infrastructure.

Options:

- direct hosting on the school origin;
- reverse proxy from the school origin to a vendor;
- static file deployed to the school host;
- explicit delegated cross-origin resource from the root manifest.

The root authority should not become `paperandslate.org` merely because paper&slate provides tooling.

## Product opportunities

A future school-site platform could provide:

- guided onboarding;
- import from existing public pages/documents;
- module-level ownership;
- review and approval queues;
- scheduled effective dates;
- course catalog builder;
- reusable templates and components;
- website generation;
- accessibility checks;
- translation workflows;
- printable catalog generation;
- EOM publication;
- structured-data/SEO output;
- public API;
- change history;
- stale-information reminders;
- correction workflow.

## Non-goals for the protocol repository

Do not add:

- user accounts;
- commercial billing;
- full CMS workflows;
- private school intranet;
- student portals;
- enrollment transactions;
- applicant records;
- staff HR systems;
- analytics profiles.

Those belong in separate products and must consume or produce EOM only at the public-data boundary.
