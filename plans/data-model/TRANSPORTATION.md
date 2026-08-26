# Transportation

## Scope

Public institutional transportation information only.

## Transport service

Fields:

- id;
- provider;
- organization/campus coverage;
- mode: bus, rail, shuttle, walking, other;
- service type;
- eligibility policy;
- accessibility;
- contact;
- operating calendar;
- status;
- alerts feed;
- route catalog.

## Route

Fields:

- id;
- public route code/name;
- service;
- direction/variant;
- stops;
- schedule;
- service days;
- effective period;
- accessibility;
- public map link;
- status;
- provenance.

## Stop

Fields:

- id;
- public name;
- general location;
- geocoordinates if publicly appropriate;
- accessibility;
- pickup/drop-off rules;
- route references.

Do not create a stop representing one student's home pickup.

## Service area

May reference:

- polygon/boundary resource;
- postal areas;
- district zones;
- narrative eligibility;
- external GIS service.

Geospatial data must declare CRS and effective dates.

## Alerts

- route/service scope;
- severity;
- effective time;
- message;
- status;
- source;
- update time;
- public alert URL.

EOM itself is not a guaranteed real-time alert transport. A resource may link GTFS-Realtime or another specialized feed in the future.

## Privacy and safety prohibitions

No:

- student assignments;
- passenger lists;
- driver private details;
- live vehicle credentials;
- security access information;
- precise private home stops;
- internal radio channels.

## Interoperability

Future adapter candidates:

- GTFS static;
- GTFS-Realtime;
- GIS boundary formats.

Do not make GTFS a v1 requirement because many school route systems are not public transit feeds.
