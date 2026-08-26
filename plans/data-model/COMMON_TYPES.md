# Common Types

## Localized text

Canonical concept:

```json
{
  "default": "en-US",
  "values": {
    "en-US": "Ecme High School",
    "es": "Escuela Secundaria Ecme"
  },
  "directions": {
    "es": "ltr"
  }
}
```

Allow a plain string only when the containing resource declares `defaultLanguage`.

Types:

- `LocalizedString`;
- `LocalizedText` for longer content;
- `LocalizedMarkdown` only in authoring source if sanitized rendering is specified;
- `LocalizedUrlLabel`.

Published rich text should avoid unsanitized HTML. A future safe rich-text profile may be added.

## Entity reference

```json
{
  "id": "https://ecme-high.example/id/department/fcs",
  "type": "department",
  "name": "Family and Consumer Sciences"
}
```

Only `id` is required. `type` and `name` are informative snapshots.

## Identifier

Fields:

- `scheme`;
- `value`;
- `authority`;
- `verificationStatus`;
- `verifiedAt`;
- `validFrom`;
- `validUntil`;
- `source`.

## Effective period

```json
{
  "from": "2027-07-01",
  "until": "2028-06-30"
}
```

Semantic validation requires `from <= until`.

## Address

Fields:

- lines;
- locality;
- dependentLocality;
- administrativeArea;
- postalCode;
- countryCode;
- formatted;
- geo;
- type;
- accessibilityNotes;
- public;
- effective.

## Geo point

- latitude;
- longitude;
- altitude optional;
- coordinate reference system fixed to WGS84 for v1;
- accuracy optional;
- provenance.

## Contact point

Prefer role-based contact.

Fields:

- id;
- contactType;
- role;
- organization/department;
- person reference optional;
- email;
- telephone;
- website;
- hours;
- languages;
- accessibility;
- audience;
- publication review/expiry.

## Schedule

Reusable schedule shape:

- timezone;
- start/end;
- recurrence rule or structured recurrence;
- exceptions;
- all-day;
- location;
- effective dates;
- human display label.

Do not invent a custom recurrence syntax if iCalendar RRULE can be safely referenced. The final RFC should decide whether to embed RFC 5545 recurrence strings or use a normalized subset.

## Money

```json
{
  "amount": "25.00",
  "currency": "USD",
  "basis": "per-course"
}
```

## Age range

- minimum;
- maximum;
- unit, normally years;
- inclusive flags;
- approximate.

## Education level reference

- vocabulary URI;
- code;
- localized label;
- jurisdiction;
- approximate age range;
- mapping references.

## Audience

May include:

- prospective students;
- current students;
- parents/guardians;
- staff;
- public;
- employers;
- developers;
- researchers.

Audience metadata is descriptive, not access control.

## License

Fields:

- identifier/URI;
- name;
- attribution;
- holder;
- terms URL;
- appliesTo;
- database-rights note;
- effective period.

## Media asset

Fields:

- id;
- href;
- mediaType;
- title;
- description/alt text;
- width/height;
- language;
- caption/transcript;
- license;
- digest;
- accessibility features.

## Quantity

- value as decimal string;
- unit URI;
- minimum/maximum optional;
- qualifier;
- method/provenance.

## Source/provenance reference

Use stable references into a resource-level provenance list. Do not repeat large source objects on every field.

## Extension namespace

Map key must be:

- absolute HTTPS URI; or
- approved reverse-domain key.

The values must be objects, not primitive fields.
