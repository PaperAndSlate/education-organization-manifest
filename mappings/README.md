# Interoperability mappings

The registry is a versioned description of controlled, public-field mappings. It is advisory and currently `preview`; it does not claim Schema.org, CEDS, Ed-Fi, 1EdTech, iCalendar, RSS, Atom, or JSON-LD certification. EOM remains the richer source model.

Every entry documents direction, supported modules, an explicit public allowlist, transformations, exact/approximate/omitted fields, provenance behavior, privacy review, fixture, and a false certification claim. Adapters parse supplied local content only. They do not follow links, execute macros/scripts, authenticate, or copy student, enrollment, grades, attendance, disability, private staff, credentials, or other prohibited fields.

The import path is intentionally candidate-oriented: source record → public allowlist → normalized EOM candidate → evidence claims → human review. Loss reports are part of the adapter result so a projection cannot silently become a second source of truth.
