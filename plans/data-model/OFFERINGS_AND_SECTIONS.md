# Course Offerings and Sections

## Course offering

An offering states that a course is available under particular conditions.

Fields:

- id;
- course reference;
- provider;
- academic period;
- status;
- mode;
- campuses/locations;
- language;
- start/end dates;
- application/enrollment windows;
- public schedule summary;
- instructor references if deliberately public;
- capacity/availability if deliberately public and fresh;
- fee overrides;
- section references;
- audience/cohort;
- provenance;
- freshness/expiry.

## Section

A section is a specific administrative or scheduled group.

Fields:

- id;
- offering;
- public section code;
- schedule;
- location;
- instructor;
- delivery mode;
- capacity and availability;
- status;
- dates.

A section must not include:

- enrolled student list;
- private join code;
- private room access details;
- internal SIS identifiers unless explicitly safe and namespaced.

## Academic period reference

Offerings should reference a defined academic period:

- academic year;
- semester/term;
- block;
- summer session;
- rolling enrollment.

## Live availability

V1 optional profile.

Fields:

- status: open, waitlist, full, closed, unknown;
- seats remaining optional;
- observedAt;
- expires;
- source;
- enrollment link.

Consumers must treat stale availability as unknown.

## Schedule privacy

A public catalog may publish period/block labels without exact times. The model supports both.

Examples:

- “Fall semester”
- “Periods 2 and 4”
- exact weekly schedule with timezone

Linter should warn when named staff have highly precise recurring schedules.

## Relationship to Schema.org

A Course may project to Schema.org `Course`; an offering/section may project to `CourseInstance`. Mapping is informative and potentially lossy.

## Website generation

The website product can generate:

- “offered next year” filters;
- term and period views;
- instructor pages;
- open/closed status;
- compare course options;
- printable offering tables.

The protocol core should not assume a timetable UI.
