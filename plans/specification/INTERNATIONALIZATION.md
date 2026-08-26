# Internationalization

## Objective

EOM must not encode one national school system as universal.

## Language tags

Use BCP 47 language tags.

Examples:

- `en`;
- `en-US`;
- `en-GB`;
- `gd`;
- `es`;
- `ar`;
- `zh-Hant`.

Schemas should validate syntax conservatively and lint against current registries where practical without requiring live lookup.

## Resource default language

Each text-bearing resource should declare:

```json
{
  "defaultLanguage": "en-US"
}
```

A plain string value is interpreted in the resource default language.

## Multilingual text

Canonical shape proposal:

```json
{
  "default": "en-US",
  "values": {
    "en-US": "Mathematics",
    "gd": "Matamataig"
  },
  "directions": {
    "en-US": "ltr",
    "gd": "ltr"
  }
}
```

The authoring profile may allow shorter YAML:

```yaml
name:
  en-US: Mathematics
  gd: Matamataig
```

The generator normalizes authoring shorthand.

Semantic rules:

- `default` must exist in `values`;
- each key is a BCP 47 tag;
- direction is `ltr`, `rtl`, or `auto`;
- no two tags normalize to the same case-insensitive language tag;
- consumers preserve unknown languages.

## Names and legal identity

Organization legal names should preserve the official script. Transliterations and translations are separate values, not replacements.

## Addresses

Use international address components:

- address lines;
- locality;
- dependent locality;
- administrative area;
- postal code;
- country code;
- formatted address;
- geocoordinates.

Do not require `state` or `ZIP`.

## Education levels

Core fields reference vocabulary URIs rather than assuming grade numbers.

Support:

- jurisdiction vocabulary;
- local display label;
- approximate age range;
- ISCED mapping where appropriate;
- school-specific level IDs.

Do not imply exact equivalence from age alone.

## Credits and workload

Credit objects include:

- value;
- credit system URI;
- jurisdiction;
- unit;
- contact hours;
- total workload;
- local label.

Do not treat Carnegie units, ECTS, SCQF credit points, or local credits as interchangeable.

## Academic periods

Model generic:

- academic year;
- term;
- semester;
- trimester;
- quarter;
- session;
- block;
- custom period.

Jurisdiction or institution profiles define local usage.

## Dates and time

- ISO 8601/RFC 3339 timestamps;
- explicit time zone using IANA TZ identifiers where scheduling matters;
- date-only values for all-day periods;
- do not assume Gregorian school-year naming is globally sufficient;
- preserve local academic-year labels separately.

## Currency and fees

Use ISO 4217 currency codes with decimal strings to avoid binary floating errors.

## Telephone and contact

Use internationally formatted telephone values, ideally E.164 when possible. Preserve human display forms separately.

## Accessibility

Text and media metadata should support:

- language;
- captions;
- transcripts;
- audio description;
- alternative text;
- accessibility features;
- accessibility hazards;
- contact for accommodations.

Do not publish individual disability information.

## Jurisdiction profiles

Profiles may define:

- organization types;
- education levels;
- identifiers;
- governance;
- funding models;
- qualification systems;
- credits;
- school year conventions;
- address requirements;
- public-data rules.

Profiles cannot weaken core privacy prohibitions.
