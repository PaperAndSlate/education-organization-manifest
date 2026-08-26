# API and Service Discovery

## Principle

EOM identifies education-specific public services. It should reuse general API discovery where possible.

## API reference

Fields:

- id;
- name;
- purpose;
- provider;
- audience;
- base URL;
- documentation;
- OpenAPI/AsyncAPI description;
- terms;
- authentication summary;
- rate-limit summary;
- version;
- status;
- data categories;
- privacy classification;
- support contact;
- `api-catalog` URL;
- provenance.

## RFC 9727 integration

When the publisher has a public API portfolio:

- publish or reference `/.well-known/api-catalog`;
- use EOM to identify which APIs relate to which educational organizations/modules;
- avoid copying complete endpoint catalogs into EOM;
- keep internal APIs out of public resources.

## Non-HTTP services

May link:

- RSS/Atom;
- iCalendar;
- GIS services;
- bulk downloads;
- webhooks in future;
- public file feeds.

## Authentication

EOM may describe that authentication is required, but must not carry credentials.

## Tool integrations

A school tool may declare:

- EOM generation capability;
- Schema.org generation;
- course-catalog export;
- public API;
- update cadence;
- vendor support link.

## Service status

Do not use EOM as a real-time status page. Link a dedicated status service when available.
