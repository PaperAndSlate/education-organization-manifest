# Source-of-Truth Contract

Normative protocol prose lives in `spec/<major.minor>/`. JSON Schema 2020-12 under `schemas/<major.minor>/` is the structural source of truth. Semantic rules live in the validator/linter rule registry. Vocabularies are versioned data artifacts. YAML and JSON under a publisher's `source/` tree are authoring inputs. Canonical generated JSON under `generated/public/` is derived and must never be edited by hand.

Examples are informative unless a fixture explicitly marks itself as conformance input. Generated types and schema reference pages are regenerated from schemas. `latest` aliases are convenience pointers; versioned specification and schema paths are immutable.
