# Academic Calendars, Events, and News

## Academic calendar

Represents institutional periods and day classifications.

Fields:

- id;
- name;
- organization/campus scope;
- timezone;
- academic year label;
- start/end;
- periods;
- instructional days;
- holidays;
- breaks;
- teacher workdays;
- assessment windows;
- early dismissal;
- closures;
- source calendar links;
- last modified;
- effective status.

## Academic period

- id;
- type;
- label;
- parent period;
- start/end;
- ordering;
- credit/reporting role.

## Day classification

Support namespaced codes rather than U.S.-only assumptions.

Examples:

- instructional;
- holiday;
- break;
- staff-development;
- assessment;
- partial-day;
- closure;
- remote-learning;
- custom.

## Event

Fields:

- id;
- name;
- description;
- event type;
- start/end/timezone;
- all-day;
- recurrence;
- organization/department/team/club;
- location/virtual URL;
- audience;
- registration;
- cost;
- accessibility;
- cancellation/status;
- contact;
- images;
- provenance;
- freshness.

## Event feeds

A catalog may reference iCalendar/ICS as an alternate representation. EOM does not need to replace iCalendar.

## Emergency notices

EOM may link to a public alert system, but is not designed as a guaranteed real-time emergency protocol. Do not make consumers rely on cacheable manifest retrieval for emergencies.

## News item

Fields:

- id;
- headline;
- summary;
- body or canonical article URL;
- publication time;
- modified time;
- author role/person optional;
- organization/department;
- categories;
- audience;
- image;
- language;
- status;
- expiry/archival status;
- provenance.

## News feed

Supports:

- latest items;
- archive indexes;
- RSS/Atom alternates;
- language;
- pagination/chunks;
- update cadence.

## Website use

Can generate:

- calendar pages;
- term date tables;
- event cards;
- club/team calendars;
- news pages;
- RSS/ICS feeds;
- printable calendars.
