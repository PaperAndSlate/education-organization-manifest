# Embed and Export Strategy

## Principle

EOM stores interoperable public facts. Presentation outputs are generated views.

## Supported output families

### Website routes

Generate:

- organization landing page;
- department pages;
- course details;
- program/pathway pages;
- catalog search/filter index;
- calendar/event pages;
- jobs/news/menu views.

Each page should link to canonical EOM resource IDs where appropriate and expose structured data.

### Embeds

Potential web components:

- course card;
- program card;
- department list;
- upcoming events;
- menu;
- job list;
- school facts panel.

Embeds should:

- be accessible without JavaScript where possible;
- use versioned component APIs;
- avoid third-party tracking by default;
- permit self-hosting;
- display data freshness;
- use the school's branding configuration, not protocol fields.

### Printable catalog

Pipeline:

```text
approved EOM data
→ print-view model
→ accessible HTML
→ paginated PDF renderer
```

The PDF is a generated artifact. It should include:

- catalog effective period;
- generation date;
- correction URL;
- stable course codes;
- accessibility tags where supported;
- page references and indexes;
- disclaimers for planned offerings.

### Schema.org

Generate JSON-LD mappings for:

- EducationalOrganization subtypes where appropriate;
- Course;
- CourseInstance for offerings/sections;
- Event;
- JobPosting;
- SportsOrganization/Organization only when mappings are semantically valid.

Do not force EOM concepts into weaker Schema.org fields. Preserve unmatched EOM data in the source rather than inventing a mapping.

### API

A school site may expose:

- raw EOM resources;
- query API for convenience;
- search index;
- filtered views.

The raw canonical resources remain the interoperability layer. A product-specific query API is not part of EOM conformance unless standardized later.

### Feeds and calendar exports

Potential adapters:

- iCalendar for events/academic calendars;
- JSON Feed/Atom/RSS for news;
- CSV for course catalog administration;
- print/PDF;
- accessibility-focused plain-text summaries.

## Generated-asset provenance

Every generated asset should record:

- EOM release/version;
- source resource IDs/digests;
- generator version;
- generation time;
- site/template version;
- language;
- effective period.

## Change management

A website build should fail or warn when:

- referenced entities disappear;
- a course ID changes unexpectedly;
- data is expired;
- required presentation text has no localization;
- a delegated resource fails validation;
- privacy rules detect prohibited content.
