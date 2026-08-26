# Publishing and Generation Methods

## 1. Hand-authored static JSON

Best for a minimal organization profile.

Process:

1. copy a valid minimal example;
2. replace synthetic values;
3. validate;
4. deploy exact path and linked resource;
5. schedule review.

Risk: direct JSON editing becomes difficult as modules grow.

## 2. Modular YAML in Git

Recommended reference workflow.

```text
owned YAML source
→ pull request
→ approvals
→ generator
→ canonical JSON
→ deployment
```

Benefits:

- human-readable;
- module ownership;
- history;
- automated validation;
- deterministic output.

## 3. Existing CMS adapter

A website CMS maps reviewed public fields into EOM at build time or request time.

Requirements:

- stable ID storage;
- versioned mapping;
- no exposure of private CMS fields;
- deterministic snapshot option;
- endpoint monitoring.

## 4. School website/CMS product

A dedicated editor manages structured EOM data and generates the site, catalog, PDF, JSON, and APIs.

The product must support export and self-hosting. EOM remains independent.

## 5. Vendor feed delegation

A specialist vendor publishes a resource. The school root explicitly delegates the exact module/resource/origin/path and validity period.

## 6. District-managed publishing

A district maintains shared data and may deploy manifests to each school origin, reverse proxy routes, or receive explicit delegations.

## 7. Document-assisted generation

An agent extracts a candidate from approved catalogs, handbooks, calendars, and public pages. It records evidence and opens a review. It does not publish directly.

## 8. Government-data enrichment

A school or foundation tool verifies identifiers or public statistics through authoritative datasets, preserves source provenance, and exposes conflicts.

## 9. Static site repository starter

paper&slate may provide a template repository with:

- source directories;
- example config;
- GitHub Actions;
- static deployment recipes;
- validator;
- CODEOWNERS;
- update guide.

## Deployment requirements common to all methods

- HTTPS;
- exact well-known path;
- JSON response;
- correct caching/media behavior;
- stable IDs;
- linked resources;
- privacy review;
- correction route;
- conformance checks;
- rollback.
