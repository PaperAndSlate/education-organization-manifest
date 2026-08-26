# School Adoption Guide

## Adoption ladder

### Level 0 — Inventory

Identify:

- authoritative domain;
- organization and campus IDs;
- public contacts;
- source owners;
- existing course catalog;
- public systems and vendors;
- data that must never be published.

### Level 1 — Minimal profile

Publish:

- root manifest;
- one organization profile;
- one role-based contact;
- language and scope;
- correction URL;
- freshness/expiry.

### Level 2 — Course discovery

Add:

- departments;
- course definitions;
- programs/pathways;
- catalog effective period;
- optional offerings.

### Level 3 — Public operations

Add modules appropriate to the school:

- calendar/events;
- policies/services;
- admissions;
- facilities;
- sports/clubs;
- transport;
- meals;
- jobs/news.

### Level 4 — Delegated integrations

Authorize district or vendor resources, add source provenance, and establish module-level update ownership.

### Level 5 — Verified publisher

Run the applicable conformance suite, publish a report, adopt an update cadence, and optionally sign resources.

## Organizational preparation

Before implementation, appoint:

- publication administrator;
- technical owner;
- privacy reviewer;
- data steward;
- module owners;
- correction contact.

Small schools may assign multiple roles to one person.

## Hosting patterns

### Static files

Best for low-change profiles and course catalogs.

### Framework route

Best when a website application can generate current JSON at build or request time.

### Reverse proxy

Best when a vendor operates the backend but the school wants the well-known endpoint on its own origin.

### Delegated resource

Best when a vendor or district owns one specialized feed. The root still lives on the school origin.

## Update cadence examples

- organization profile: termly and on material change;
- courses/programs: each catalog release;
- offerings: daily or when scheduling changes;
- calendar: daily;
- events/news/jobs: hourly or daily;
- menus: daily;
- transport notices: event-driven;
- staff: termly and on staffing changes;
- policies: on approval/change;
- statistics: when the authoritative release updates.

These are recommendations; module registry metadata should carry the actual policy.

## Launch checklist

- root path resolves over HTTPS;
- exact media type;
- valid schema and semantic report;
- canonical IDs stable;
- resources reachable;
- delegation tested;
- private information excluded;
- correction route works;
- owners approve;
- cache/expiry configured;
- rollback available;
- draft protocol status represented accurately.

## Ongoing maintenance

- automated link and freshness checks;
- scheduled owner reviews;
- stale-source alerts;
- annual privacy review;
- key rotation if signatures are used;
- protocol-version monitoring;
- archived historical snapshots;
- correction response targets.

## Guidance for schools without technical staff

paper&slate or third parties may provide:

- a questionnaire;
- a hosted generator;
- a GitHub starter repository;
- static hosting instructions;
- a CMS;
- vendor adapters;
- validation and support.

The protocol must not require the hosted service. Export and self-hosting should always be available.
