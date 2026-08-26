# Future School Website and Catalog Platform

## Repository boundary

Build separately:

`paperandslate/school-sites`

It consumes and generates EOM but is not required for protocol conformance.

## Product thesis

Let a school maintain reviewed structured public data once and generate:

- full school website;
- department pages;
- course/program catalog;
- event/calendar views;
- news/jobs/menus;
- printable catalog;
- EOM publication;
- Schema.org output;
- public API;
- embeds.

## Roles

- organization administrator;
- publication administrator;
- data steward;
- department owner;
- content editor;
- privacy reviewer;
- translator;
- vendor integration operator.

## Workflow

```text
draft
→ module-owner review
→ privacy/technical review
→ scheduled/effective approval
→ generate
→ preview
→ publish website + EOM
→ monitor freshness
```

## Data architecture

- public institutional entities map directly to EOM authoring model;
- presentation/layout/brand data is product-specific;
- private workflow state never enters EOM;
- imported source claims retain evidence;
- export produces complete portable authoring source and canonical JSON.

## Features

### Initial

- organization setup;
- domain/endpoint deployment;
- course/department/program editor;
- ownership and approvals;
- site templates;
- catalog search;
- EOM validator/generator;
- static export.

### Later

- AI-assisted extraction;
- translation;
- PDF catalog;
- calendar/menu/vendor adapters;
- district multi-school administration;
- design system/theme marketplace;
- accessibility audits;
- analytics on public pages;
- foundation index submission.

## Safety

Never turn the public website platform into an SIS. Keep students, grades, private schedules, applications, and protected records out of the EOM/public content boundary.

## Commercial/open model

Potential approach:

- EOM specification, schemas, CLI, validator, and core generators open source;
- hosted CMS, managed deployment, premium themes, support, and integrations may be commercial;
- export/self-hosting remains possible;
- no proprietary lock on school identity or public EOM files.
