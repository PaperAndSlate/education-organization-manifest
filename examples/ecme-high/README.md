# Ecme High School reference example

Ecme High School is a wholly fictitious public high school used to exercise every EOM 1.0 module family. All organizations, people, identifiers, dates, domains, and values are synthetic.

Required banner:

> Ecme High School is fictional. All data and people shown are synthetic.

The checked-in `public/` tree mirrors a static deployment:

- `/.well-known/educational-organization-manifest` — compact root manifest;
- `/.well-known/educational-organization-manifest.json` — JSON-addressable development alias;
- `/eom/*.json` — independently validatable module resources.

The checked-in public tree contains the 57-course `2027–2028` catalog, nine departments, public offerings/sections, two pathways, and representative fees, materials, outcomes, standards, localization, lifecycle, and prerequisite relationships. A historical catalog fixture lives under `fixtures/valid/course/`; the proposed `2028–2029` source is deliberately outside the configured public source patterns and is never emitted by the release build.

Validate the root and individual modules locally:

```powershell
pnpm eom validate examples/ecme-high/public/.well-known/educational-organization-manifest --json
pnpm eom validate examples/ecme-high/public/eom/courses.json --json
```

The example intentionally excludes student records, private staff data, private schedules, rider assignments, security layouts, credentials, and internal endpoints.
