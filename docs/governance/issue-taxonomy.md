# Issue Taxonomy

Use labels and issue templates that preserve the planning pack's work areas:

- `phase:0` through `phase:9` for delivery sequencing;
- `area:protocol`, `area:schema`, `area:tooling`, `area:docs`, `area:privacy`, `area:security`, `area:governance`, `area:interop`, `area:release`;
- `type:rfc`, `type:adr`, `type:test`, `type:bug`, `type:docs`, `type:adoption`;
- `status:blocked-external` for IANA, independent pilots, legal review, public consensus, or certification evidence unavailable to repository tooling.

Each semantic issue links one or more stable IDs in `requirements/TRACEABILITY_MATRIX.md`. External blockers remain open until the required evidence is recorded. Security/privacy issues are never hidden in general cleanup.
