# EOM 1.0 Internationalization

Use BCP 47 language tags and preserve unknown language values. A resource may declare `defaultLanguage`; a localized value has a `default` tag, a `values` map, and optional `directions` map with `ltr`, `rtl`, or `auto`. The default tag must exist in values and language keys must not collide after case normalization.

Addresses use international components rather than assuming state/ZIP. Education levels reference jurisdiction vocabularies with local codes and labels; age alone does not imply equivalence. Credits include value, system, jurisdiction, and unit; local credits, ECTS, Carnegie units, and other systems are not interchangeable. Academic periods support year, term, semester, trimester, quarter, session, block, and custom types.

Scheduling uses RFC 3339/ISO 8601 values with explicit IANA time zones where exact time matters. Money uses ISO 4217 and decimal strings. Phone values should use international format with display forms separate. Media includes language and accessibility metadata such as alt text, captions, transcripts, and audio description. Jurisdiction profiles may add requirements but cannot weaken privacy rules.
